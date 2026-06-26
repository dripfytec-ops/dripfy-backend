import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCampaignDto } from './dto/campaign.dto';
import { CampaignStatus, LeadStatus, MessageStatus } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private activeTimers = new Map<string, NodeJS.Timeout[]>();

  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCampaignDto) {
    const canal = await this.prisma.canal.findFirst({
      where: { id: dto.canal_id, tenant_id: tenantId },
    });
    if (!canal) throw new BadRequestException('Canal não encontrado.');

    return this.prisma.campanhaFila.create({
      data: {
        tenant_id: tenantId,
        canal_id: dto.canal_id,
        nome_campanha: dto.nome_campanha,
        template_name: dto.template_name,
        template_params: dto.template_params || {},
        delay_segundos: dto.delay_segundos,
        status: CampaignStatus.pausado,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.campanhaFila.findMany({
      where: { tenant_id: tenantId },
      orderBy: { criado_em: 'desc' },
      include: {
        canal: { select: { id: true, nome: true, phone_number_id: true } },
      },
    });
  }

  async start(tenantId: string, campanhaId: string) {
    this.logger.log(`=== START CAMPANHA ${campanhaId} ===`);
    const campanha = await this.prisma.campanhaFila.findFirst({
      where: { id: campanhaId, tenant_id: tenantId },
      include: { canal: true },
    });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');
    if (campanha.status === CampaignStatus.rodando) throw new BadRequestException('Campanha já está rodando.');
    if (!campanha.canal) throw new BadRequestException('Campanha sem canal configurado.');

    const leads = await this.prisma.lead.findMany({
      where: { tenant_id: tenantId, disparado: false },
    });

    this.logger.log(`Leads: ${leads.length} | Canal: ${campanha.canal.nome} | phoneId: ${campanha.canal.phone_number_id}`);
    if (leads.length === 0) throw new BadRequestException('Nenhum lead pendente de disparo. Importe leads antes de iniciar.');

    await this.prisma.campanhaFila.update({
      where: { id: campanhaId },
      data: { status: CampaignStatus.rodando },
    });

    const timers: NodeJS.Timeout[] = [];
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const delay = i * campanha.delay_segundos * 1000;
      const isLast = i === leads.length - 1;
      const timer = setTimeout(async () => {
        await this.dispatchLead({
          leadId: lead.id_number,
          tenantId,
          campanhaId,
          canalId: campanha.canal!.id,
          phoneNumberId: campanha.canal!.phone_number_id,
          wabaId: campanha.canal!.waba_id,
          accessToken: campanha.canal!.meta_access_token,
          templateName: campanha.template_name,
          templateParams: campanha.template_params as Record<string, any>,
          telefone: lead.telefone,
          nome: lead.nome,
        });
        if (isLast) {
          await this.prisma.campanhaFila.update({
            where: { id: campanhaId },
            data: { status: CampaignStatus.concluido },
          }).catch(() => {});
          this.activeTimers.delete(campanhaId);
          this.logger.log(`Campanha ${campanhaId} concluída.`);
        }
      }, delay);
      timers.push(timer);
    }
    this.activeTimers.set(campanhaId, timers);

    return { message: `${leads.length} disparos agendados.`, total: leads.length };
  }

  private async dispatchLead(data: {
    leadId: number; tenantId: string; campanhaId: string; canalId: string;
    phoneNumberId: string; wabaId: string; accessToken: string; templateName: string;
    templateParams?: Record<string, any>; telefone: string; nome: string;
  }) {
    this.logger.log(`Disparando Lead #${data.leadId} → ${data.telefone} | template=${data.templateName}`);
    try {
      // Busca os componentes do template para saber quantos parâmetros precisa
      const tplRes = await axios.get(
        `https://graph.facebook.com/v20.0/${data.wabaId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${data.accessToken}` },
          params: { fields: 'name,components', name: data.templateName, limit: 1 },
        },
      ).catch(() => null);

      const tplData = tplRes?.data?.data?.[0];
      const headerComponent = tplData?.components?.find((c: any) => c.type === 'HEADER');
      const bodyComponent = tplData?.components?.find((c: any) => c.type === 'BODY');
      const bodyText: string = bodyComponent?.text || '';
      const headerFormat: string = headerComponent?.format || '';
      const headerImageUrl: string = headerComponent?.example?.header_handle?.[0] || '';

      // Se o fetch do template falhou, usa o setting da campanha como fallback
      const paramCount = tplData
        ? (bodyText.match(/\{\{\d+\}\}/g) || []).length
        : (data.templateParams?.usa_nome ? 1 : 0);

      this.logger.log(`Template "${data.templateName}" → tplFetched=${!!tplData} | header=${headerFormat} | params=${paramCount} | fallback_usa_nome=${data.templateParams?.usa_nome}`);

      const components: any[] = [];

      if (headerFormat === 'IMAGE' && headerImageUrl) {
        components.push({
          type: 'header',
          parameters: [{ type: 'image', image: { link: headerImageUrl } }],
        });
      }

      if (paramCount > 0) {
        components.push({
          type: 'body',
          parameters: [{ type: 'text', text: data.nome }],
        });
      }

      const payload = {
        messaging_product: 'whatsapp',
        to: data.telefone,
        type: 'template',
        template: {
          name: data.templateName,
          language: { code: 'pt_BR' },
          ...(components.length > 0 ? { components } : {}),
        },
      };
      this.logger.log(`Payload: ${JSON.stringify(payload)}`);
      const response = await axios.post(
        `https://graph.facebook.com/v20.0/${data.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${data.accessToken}`, 'Content-Type': 'application/json' } },
      );

      const wamid = response.data?.messages?.[0]?.id;
      this.logger.log(`OK Lead #${data.leadId} wamid=${wamid}`);

      await this.prisma.message.create({
        data: { tenant_id: data.tenantId, canal_id: data.canalId, lead_id: data.leadId, campanha_id: data.campanhaId, wamid, template_name: data.templateName, status: MessageStatus.enviado },
      });
      await this.prisma.lead.update({
        where: { id_number: data.leadId },
        data: { disparado: true, status_atual: LeadStatus.aguardando_resposta },
      });
      await this.prisma.campanhaFila.update({
        where: { id: data.campanhaId },
        data: { enviados: { increment: 1 } },
      });
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || error.message;
      this.logger.error(`ERRO Lead #${data.leadId}: ${msg}`);
      await this.prisma.message.create({
        data: { tenant_id: data.tenantId, canal_id: data.canalId, lead_id: data.leadId, campanha_id: data.campanhaId, template_name: data.templateName, status: MessageStatus.erro, erro_msg: msg },
      }).catch(() => {});
      await this.prisma.campanhaFila.update({
        where: { id: data.campanhaId },
        data: { erros: { increment: 1 } },
      }).catch(() => {});
    }
  }

  async pause(tenantId: string, campanhaId: string) {
    const campanha = await this.prisma.campanhaFila.findFirst({
      where: { id: campanhaId, tenant_id: tenantId },
    });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');

    const timers = this.activeTimers.get(campanhaId) || [];
    timers.forEach((t) => clearTimeout(t));
    this.activeTimers.delete(campanhaId);

    return this.prisma.campanhaFila.update({
      where: { id: campanhaId },
      data: { status: CampaignStatus.pausado },
    });
  }

  async getStats(tenantId: string, campanhaId: string) {
    const campanha = await this.prisma.campanhaFila.findFirst({
      where: { id: campanhaId, tenant_id: tenantId },
    });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');
    return { campanha };
  }
}
