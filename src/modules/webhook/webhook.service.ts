import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatwootService } from '../chatwoot/chatwoot.service';
import { CanaisService } from '../canais/canais.service';
import { MessageStatus, MessageDirection, LeadStatus } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private prisma: PrismaService,
    private chatwootService: ChatwootService,
    private canaisService: CanaisService,
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

    if (canal?.template_boas_vindas) {
      try {
        await axios.post(
          `https://graph.facebook.com/v20.0/${canal.phone_number_id}/messages`,
          {
            messaging_product: 'whatsapp',
            to: telefoneNorm,
            type: 'template',
            template: {
              name: canal.template_boas_vindas,
              language: { code: 'pt_BR' },
              components: [{ type: 'body', parameters: [{ type: 'text', text: data.nome }] }],
            },
          },
          { headers: { Authorization: `Bearer ${canal.meta_access_token}` } },
        );

        await this.prisma.lead.update({
          where: { id_number: lead.id_number },
          data: { disparado: true, status_atual: LeadStatus.aguardando_resposta },
        });

        this.logger.log(`Disparo imediato OK → ${data.nome} (${telefoneNorm})`);
      } catch (e) {
        this.logger.error(`Falha no disparo imediato: ${e.message}`);
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

  async processMetaGlobal(body: any) {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const phoneNumberId = changes?.value?.metadata?.phone_number_id;

    if (!phoneNumberId) return;

    // Identifica tenant pelo phone_number_id sem precisar do slug na URL
    const canal = await this.canaisService.findByPhoneNumberIdGlobal(phoneNumberId);
    if (!canal) {
      this.logger.warn(`Webhook recebido para phoneNumberId desconhecido: ${phoneNumberId}`);
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

    // Busca etiqueta "em_atendimento" para mover o lead ao responder
    const etAtendimento = await this.prisma.etiqueta.findFirst({
      where: { tenant_id: tenant.id, slug: 'em_atendimento' },
    });

    for (const msg of messages) {
      const telefone = msg.from;
      const texto = msg.text?.body || '[mídia]';

      this.logger.log(`Mensagem recebida de ${telefone} → "${texto}"`);

      const lead = await this.prisma.lead.findFirst({
        where: { tenant_id: tenant.id, telefone },
      });

      if (lead) {
        // Mover para "em atendimento" se estava aguardando resposta
        if (etAtendimento) {
          await this.prisma.lead.update({
            where: { id_number: lead.id_number },
            data: { etiqueta_id: etAtendimento.id },
          });
        }

        // Salvar mensagem recebida no banco
        await this.prisma.message.create({
          data: {
            tenant_id: tenant.id,
            canal_id: canal?.id || null,
            lead_id: lead.id_number,
            direction: MessageDirection.entrada,
            content: texto,
            status: MessageStatus.entregue,
          },
        });
      }

      const contactId = await this.chatwootService.createOrUpdateContact(
        tenant.id,
        lead?.nome || telefone,
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

    for (const s of statuses) {
      const newStatus = statusMap[s.status];
      if (!newStatus || !s.id) continue;

      await this.prisma.message.updateMany({
        where: { wamid: s.id },
        data: {
          status: newStatus,
          ...(s.status === 'failed' ? { erro_msg: s.errors?.[0]?.title || 'Falha no envio' } : {}),
        },
      });

      this.logger.log(`Status atualizado → wamid=${s.id} status=${newStatus}`);
    }
  }
}
