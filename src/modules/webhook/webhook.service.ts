import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatwootService } from '../chatwoot/chatwoot.service';
import { DmCanaisService } from '../disparo-massa/dm-canais.service';
import { MediaService } from '../../common/media/media.service';
import { telefoneVariantes } from '../../common/utils/telefone.util';
import { MessageStatus, MessageDirection, LeadStatus } from '@prisma/client';
import axios from 'axios';

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const;
const MEDIA_LABEL: Record<string, string> = {
  image: '📷 Imagem',
  audio: '🎤 Áudio',
  video: '🎥 Vídeo',
  document: '📄 Documento',
  sticker: '🌟 Figurinha',
};

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private prisma: PrismaService,
    private chatwootService: ChatwootService,
    private canaisService: DmCanaisService,
    private mediaService: MediaService,
  ) {}

  async insertLeadAndFireImmediate(tenantSlug: string, data: { nome: string; telefone: string; cpf?: string }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    const telefoneNorm = data.telefone.replace(/\D/g, '');

    const lead = await this.prisma.lead.upsert({
      where: { tenant_id_cpf: { tenant_id: tenant.id, cpf: data.cpf || telefoneNorm } },
      update: {},
      create: {
        tenant_id: tenant.id,
        nome: data.nome,
        telefone: telefoneNorm,
        cpf: data.cpf || telefoneNorm,
        status_atual: LeadStatus.balde_geral,
      },
    });

    const canal = await this.canaisService.findFirstActive(tenant.id);

    if (canal?.saudacao_ativa && canal?.mensagem_boas_vindas) {
      const { wamid } = await this.enviarSaudacao(canal, telefoneNorm, data.nome);
      if (wamid !== null) {
        await this.prisma.lead.update({
          where: { id_number: lead.id_number },
          data: { disparado: true, status_atual: LeadStatus.aguardando_resposta },
        });

        this.logger.log(`Disparo imediato OK → ${data.nome} (${telefoneNorm})`);
      }
    }

    const contactId = await this.chatwootService.createOrUpdateContact(tenant.id, data.nome, telefoneNorm);
    if (contactId) {
      await this.chatwootService.createConversation(
        tenant.id,
        contactId,
        `Novo lead via webhook: ${data.nome}`,
        canal?.chatwoot_inbox_id ?? undefined,
      );
    }

    return { lead_id: lead.id_number, status: 'processado' };
  }

  // Dispara a mensagem de boas-vindas em texto livre (configurada pelo
  // usuário) via Graph API. Válido dentro da janela de 24h aberta pelo
  // lead — não precisa ser um template aprovado pela Meta, já que é sempre
  // uma resposta a uma mensagem que o lead acabou de mandar.
  // Retorna o wamid da mensagem enviada, ou null em caso de falha.
  private async enviarSaudacao(
    canal: { phone_number_id: string; access_token: string; mensagem_boas_vindas: string | null },
    telefone: string,
    nome: string,
  ): Promise<{ wamid: string | null; texto: string }> {
    const texto = (canal.mensagem_boas_vindas || '').replace(/\{\{\s*nome\s*\}\}/gi, nome);
    try {
      const { data } = await axios.post(
        `https://graph.facebook.com/v20.0/${canal.phone_number_id}/messages`,
        {
          messaging_product: 'whatsapp',
          to: telefone,
          type: 'text',
          text: { body: texto },
        },
        { headers: { Authorization: `Bearer ${canal.access_token}` } },
      );
      return { wamid: data?.messages?.[0]?.id || null, texto };
    } catch (e) {
      this.logger.error(`Falha ao enviar saudação: ${e.message}`);
      return { wamid: null, texto };
    }
  }

  async processMetaGlobal(body: any) {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const phoneNumberId = changes?.value?.metadata?.phone_number_id;

    if (!phoneNumberId) return;

    // Identifica tenant pelo phone_number_id sem precisar do slug na URL
    const canal = await this.canaisService.findByPhoneNumberIdGlobal(phoneNumberId);
    if (!canal) {
      this.logger.warn(`Webhook recebido para phoneNumberId desconhecido: ${phoneNumberId}`);
      // Mesmo sem canal de leads/chat identificado, tenta atualizar status de
      // entrega de contatos do Disparo em Massa (podem usar o mesmo número).
      const statuses = changes?.value?.statuses;
      if (statuses?.length) await this.processStatusUpdates(statuses);
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: canal.tenant_id } });
    if (!tenant) return;

    await this.processMetaPayload(tenant, canal, changes);
  }

  async processMeta(tenantSlug: string, body: any) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return;

    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];

    const phoneNumberId = changes?.value?.metadata?.phone_number_id;
    const canal = phoneNumberId
      ? await this.canaisService.findByPhoneNumberId(tenant.id, phoneNumberId)
      : await this.canaisService.findFirstActive(tenant.id);

    await this.processMetaPayload(tenant, canal, changes);
  }

  private async processMetaPayload(tenant: { id: string }, canal: any, changes: any) {
    const statuses = changes?.value?.statuses;
    if (statuses?.length) {
      await this.processStatusUpdates(statuses);
    }

    const messages = changes?.value?.messages;
    if (!messages?.length) return;

    // Busca etiqueta "responderam" para mover o lead ao responder
    const etAtendimento = await this.prisma.etiqueta.findFirst({
      where: { tenant_id: tenant.id, slug: 'responderam' },
    });

    for (const msg of messages) {
      const telefone = msg.from;
      const wamidEntrada = msg.id || null;

      const tipoMidia = MEDIA_TYPES.find((t) => t === msg.type);
      const midiaObj = tipoMidia ? msg[tipoMidia] : null;

      let mediaUrl: string | null = null;
      let mediaMimeType: string | null = null;
      // Resposta de botão de um template (ex: "Sim"/"Não"), de mensagem
      // interativa (lista/botões), reação com emoji, localização ou contato
      // compartilhado — sem isso, tudo isso caía no fallback genérico
      // "[mídia]" mesmo não sendo imagem/áudio/documento de verdade.
      let texto = msg.text?.body
        || msg.button?.text
        || msg.interactive?.button_reply?.title
        || msg.interactive?.list_reply?.title
        || (msg.type === 'reaction' ? (msg.reaction?.emoji ? `Reagiu: ${msg.reaction.emoji}` : 'Removeu a reação') : '')
        || (msg.type === 'location' ? '📍 Localização' : '')
        || (msg.type === 'contacts' ? `👤 Contato: ${msg.contacts?.[0]?.name?.formatted_name || 'compartilhado'}` : '')
        || (msg.type === 'unsupported' ? '⚠️ Tipo de mensagem não suportado pelo WhatsApp' : '')
        || '';

      if (midiaObj?.id && canal?.access_token) {
        const baixada = await this.mediaService.downloadAndSave(midiaObj.id, canal.access_token);
        if (baixada) {
          mediaUrl = baixada.url;
          mediaMimeType = baixada.mimeType;
        }
        texto = midiaObj.caption || MEDIA_LABEL[tipoMidia!] || '[mídia]';
      } else if (!texto) {
        // Tipo de mensagem que ainda não reconhecemos — loga o payload bruto
        // pra dar pra diagnosticar e adicionar suporte depois.
        this.logger.warn(`Tipo de mensagem não tratado (${msg.type}): ${JSON.stringify(msg)}`);
        texto = '[mídia]';
      }

      this.logger.log(`Mensagem recebida de ${telefone} → "${texto}"`);

      // Busca o lead mais antigo com esse telefone (evita duplicatas). Usa as
      // variantes com/sem o 9º dígito porque a Meta nem sempre manda o wa_id
      // no mesmo formato que foi salvo no disparo original.
      let lead = await this.prisma.lead.findFirst({
        where: { tenant_id: tenant.id, telefone: { in: telefoneVariantes(telefone) } },
        orderBy: { criado_em: 'asc' },
      });

      // Primeira resposta do lead depois de um disparo (campanha ou saudação
      // imediata) — é o gatilho pra mandar a mensagem de boas-vindas.
      // Precisa ser lido ANTES do update abaixo, que muda o status.
      const primeiraRespostaAoDisparo = lead?.status_atual === LeadStatus.aguardando_resposta;

      if (!lead) {
        // Número desconhecido → cria lead automaticamente marcado como iniciado pelo cliente
        this.logger.log(`Número desconhecido ${telefone} — criando lead automaticamente`);
        lead = await this.prisma.lead.create({
          data: {
            tenant_id: tenant.id,
            nome: `Contato ${telefone}`,
            telefone,
            iniciado_pelo_cliente: true,
            canal_id: canal?.id ?? null,
            etiquetas: etAtendimento ? { connect: [{ id: etAtendimento.id }] } : undefined,
            last_message_at: new Date(),
            last_message_preview: texto.slice(0, 120),
            unread_count: 1,
          },
        });
      } else {
        // Lead existente → adiciona a etiqueta "Responderam" (se ainda não tiver) e atualiza última mensagem/não lidas.
        // Leads criados antes do campo canal_id existir ficam sem dono — usa
        // esse recebimento pra preencher (só quando ainda estava nulo).
        if (etAtendimento) {
          await this.prisma.lead.update({
            where: { id_number: lead.id_number },
            data: { etiquetas: { connect: [{ id: etAtendimento.id }] } },
          });
        }
        await this.prisma.lead.update({
          where: { id_number: lead.id_number },
          data: {
            last_message_at: new Date(),
            last_message_preview: texto.slice(0, 120),
            unread_count: { increment: 1 },
            ...(lead.canal_id ? {} : { canal_id: canal?.id ?? null }),
            ...(primeiraRespostaAoDisparo ? { status_atual: LeadStatus.em_atendimento } : {}),
          },
        });
      }

      // Salvar mensagem recebida (ignora se o wamid já existe)
      await this.prisma.message.upsert({
        where: { wamid: wamidEntrada || `entrada-${lead.id_number}-${Date.now()}` },
        update: {},
        create: {
          tenant_id: tenant.id,
          canal_id: canal?.id || null,
          lead_id: lead.id_number,
          wamid: wamidEntrada,
          direction: MessageDirection.entrada,
          content: texto,
          media_url: mediaUrl,
          media_mime_type: mediaMimeType,
          status: MessageStatus.entregue,
        },
      });

      if (primeiraRespostaAoDisparo && canal?.saudacao_ativa && canal?.mensagem_boas_vindas) {
        const { wamid: wamidSaudacao, texto: textoSaudacao } = await this.enviarSaudacao(canal, telefone, lead.nome);
        if (wamidSaudacao !== null) {
          await this.prisma.message.create({
            data: {
              tenant_id: tenant.id,
              canal_id: canal.id,
              lead_id: lead.id_number,
              wamid: wamidSaudacao,
              content: textoSaudacao,
              direction: MessageDirection.saida,
              status: MessageStatus.enviado,
            },
          }).catch((e) => this.logger.error(`Falha ao registrar mensagem de saudação do lead ${lead.id_number}: ${e.message}`));
        }
      }

      const contactId = await this.chatwootService.createOrUpdateContact(
        tenant.id,
        lead.nome,
        telefone,
      );

      if (contactId) {
        await this.chatwootService.createConversation(
          tenant.id,
          contactId,
          texto,
          canal?.chatwoot_inbox_id ?? undefined,
        );
      }
    }
  }

  private async processStatusUpdates(statuses: any[]) {
    const statusMap: Record<string, MessageStatus> = {
      sent: MessageStatus.enviado,
      delivered: MessageStatus.entregue,
      read: MessageStatus.lido,
      failed: MessageStatus.erro,
    };
    const dmStatusMap: Record<string, 'entregue' | 'lido' | 'falha'> = {
      delivered: 'entregue',
      read: 'lido',
      failed: 'falha',
    };

    for (const s of statuses) {
      const newStatus = statusMap[s.status];
      if (newStatus && s.id) {
        await this.prisma.message.updateMany({
          where: { wamid: s.id },
          data: {
            status: newStatus,
            ...(s.status === 'failed' ? { erro_msg: s.errors?.[0]?.title || 'Falha no envio' } : {}),
          },
        });
      }

      const dmStatus = dmStatusMap[s.status];
      if (dmStatus && s.id) {
        await this.aplicarStatusDmContato(s.id, dmStatus, s.errors?.[0]?.title || s.errors?.[0]?.message);
      }

      this.logger.log(`Status atualizado → wamid=${s.id} status=${newStatus || dmStatus}`);
    }
  }

  // Espelha o status de entrega também num contato de Disparo em Massa, se o
  // message_id bater com um. IS DISTINCT evita reprocessar reentregas do
  // mesmo webhook (a Meta reenvia "at-least-once").
  private async aplicarStatusDmContato(messageId: string, novoStatus: 'entregue' | 'lido' | 'falha', motivo?: string) {
    const contato = await this.prisma.dmContato.findFirst({ where: { message_id: messageId } });
    if (!contato || contato.status === novoStatus) return;

    await this.prisma.dmContato.update({
      where: { id: contato.id },
      data: { status: novoStatus, ...(motivo ? { erro: motivo } : {}) },
    });

    const contaComoEntregue = (novoStatus === 'entregue' || novoStatus === 'lido') && !['entregue', 'lido'].includes(contato.status);
    const contaComoFalha = novoStatus === 'falha' && contato.status !== 'falha';
    if (contaComoEntregue) {
      await this.prisma.dmCampanha.update({ where: { id: contato.campanha_id }, data: { entregues: { increment: 1 } } });
    } else if (contaComoFalha) {
      await this.prisma.dmCampanha.update({ where: { id: contato.campanha_id }, data: { falhas: { increment: 1 } } });
    }
  }
}
