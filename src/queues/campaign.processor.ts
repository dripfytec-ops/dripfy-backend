import { Process, Processor, OnQueueError, OnQueueFailed, OnQueueActive } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus, MessageStatus } from '@prisma/client';

export const CAMPAIGN_QUEUE = 'campaign-dispatch';

export interface CampaignJobData {
  leadId: number;
  tenantId: string;
  campanhaId: string;
  canalId: string;
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  templateParams?: Record<string, any>;
  telefone: string;
  nome: string;
}

@Processor(CAMPAIGN_QUEUE)
export class CampaignProcessor {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(private prisma: PrismaService) {}

  @OnQueueError()
  onError(error: Error) { this.logger.error('REDIS QUEUE ERROR:', error.message); }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) { this.logger.error(`JOB FALHOU #${job.id}:`, error.message); }

  @OnQueueActive()
  onActive(job: Job) { this.logger.log(`JOB ATIVO #${job.id} lead=${job.data?.leadId}`); }

  @Process('dispatch')
  async handleDispatch(job: Job<CampaignJobData>) {
    const { leadId, tenantId, campanhaId, canalId, phoneNumberId, accessToken, templateName, templateParams, telefone } = job.data;
    this.logger.log(`=== PROCESSANDO JOB Lead #${leadId} tel=${telefone} phoneId=${phoneNumberId} template=${templateName} ===`);

    try {
      const components = templateParams
        ? [{ type: 'body', parameters: Object.values(templateParams).map((v) => ({ type: 'text', text: String(v) })) }]
        : [];

      const response = await axios.post(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: telefone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'pt_BR' },
            components,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const wamid = response.data?.messages?.[0]?.id;

      await this.prisma.message.create({
        data: {
          tenant_id: tenantId,
          canal_id: canalId,
          lead_id: leadId,
          campanha_id: campanhaId,
          wamid,
          template_name: templateName,
          status: MessageStatus.enviado,
        },
      });

      await this.prisma.lead.update({
        where: { id_number: leadId },
        data: { disparado: true, status_atual: LeadStatus.aguardando_resposta },
      });

      await this.prisma.campanhaFila.update({
        where: { id: campanhaId },
        data: { enviados: { increment: 1 } },
      });

      this.logger.log(`Disparo OK → Lead #${leadId} (${telefone}) wamid=${wamid}`);
    } catch (error) {
      const msg = error?.response?.data?.error?.message || error.message;
      this.logger.error(`Falha no disparo Lead #${leadId}: ${msg}`);

      await this.prisma.message.create({
        data: {
          tenant_id: tenantId,
          canal_id: canalId,
          lead_id: leadId,
          campanha_id: campanhaId,
          template_name: templateName,
          status: MessageStatus.erro,
          erro_msg: msg,
        },
      });

      await this.prisma.campanhaFila.update({
        where: { id: campanhaId },
        data: { erros: { increment: 1 } },
      });

      throw error;
    }
  }
}
