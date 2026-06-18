import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatwootService } from '../chatwoot/chatwoot.service';
import { CanaisService } from '../canais/canais.service';
import { LeadStatus, MessageStatus } from '@prisma/client';
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
      await this.chatwootService.createConversation(tenant.id, contactId, `Novo lead via webhook: ${data.nome}`);
    }

    return { lead_id: lead.id_number, status: 'processado' };
  }

  async processMeta(tenantSlug: string, body: any) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return;

    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];

    // Identifica o canal pelo phone_number_id da Meta
    const phoneNumberId = changes?.value?.metadata?.phone_number_id;
    const canal = phoneNumberId
      ? await this.canaisService.findByPhoneNumberId(tenant.id, phoneNumberId)
      : await this.canaisService.findFirstActive(tenant.id);

    // Callbacks de status de entrega
    const statuses = changes?.value?.statuses;
    if (statuses?.length) {
      await this.processStatusUpdates(statuses);
    }

    // Mensagens recebidas (respostas do cliente)
    const messages = changes?.value?.messages;
    if (!messages?.length) return;

    for (const msg of messages) {
      const telefone = msg.from;
      const texto = msg.text?.body || '[mídia]';

      const lead = await this.prisma.lead.findFirst({
        where: { tenant_id: tenant.id, telefone },
      });

      if (lead && lead.status_atual === LeadStatus.aguardando_resposta) {
        await this.prisma.lead.update({
          where: { id_number: lead.id_number },
          data: { status_atual: LeadStatus.em_atendimento },
        });
      }

      const contactId = await this.chatwootService.createOrUpdateContact(
        tenant.id,
        lead?.nome || telefone,
        telefone,
      );

      if (contactId) {
        await this.chatwootService.createConversation(tenant.id, contactId, texto);
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
