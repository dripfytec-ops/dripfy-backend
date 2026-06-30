import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageDirection, MessageStatus } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async getByLead(tenantId: string, leadId: number) {
    return this.prisma.message.findMany({
      where: { tenant_id: tenantId, lead_id: leadId },
      orderBy: { criado_em: 'asc' },
    });
  }

  async getByTenant(tenantId: string, limit = 50) {
    return this.prisma.message.findMany({
      where: { tenant_id: tenantId },
      orderBy: { criado_em: 'desc' },
      take: limit,
      include: { lead: { select: { nome: true, telefone: true } } },
    });
  }

  async deleteByLead(tenantId: string, leadId: number) {
    // Verifica que o lead pertence ao tenant antes de deletar
    const lead = await this.prisma.lead.findFirst({ where: { id_number: leadId, tenant_id: tenantId } });
    if (!lead) throw new Error('Lead não encontrado.');
    const { count } = await this.prisma.message.deleteMany({ where: { lead_id: leadId, tenant_id: tenantId } });
    return { deleted: count };
  }

  async reply(tenantId: string, leadId: number, texto: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id_number: leadId, tenant_id: tenantId },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const canal = await this.prisma.canal.findFirst({
      where: { tenant_id: tenantId, ativo: true },
    });
    if (!canal) throw new NotFoundException('Nenhum canal WhatsApp ativo encontrado.');

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v20.0/${canal.phone_number_id}/messages`,
        {
          messaging_product: 'whatsapp',
          to: lead.telefone,
          type: 'text',
          text: { body: texto },
        },
        { headers: { Authorization: `Bearer ${canal.meta_access_token}` } },
      );

      const wamid = response.data?.messages?.[0]?.id;

      return this.prisma.message.create({
        data: {
          tenant_id: tenantId,
          canal_id: canal.id,
          lead_id: leadId,
          direction: MessageDirection.saida,
          content: texto,
          wamid,
          status: MessageStatus.enviado,
        },
      });
    } catch (error: any) {
      const metaError = error?.response?.data?.error;
      // Código 131047 = fora da janela de 24h de atendimento
      if (metaError?.code === 131047 || metaError?.code === 130472) {
        throw new BadRequestException(
          'Fora da janela de 24h. O cliente precisa enviar uma mensagem primeiro para você poder responder com texto livre.',
        );
      }
      const msg = metaError?.message || error.message;
      throw new BadRequestException(`Erro ao enviar mensagem: ${msg}`);
    }
  }
}
