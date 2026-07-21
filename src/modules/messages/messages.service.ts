import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../../common/media/media.service';
import { MessageDirection, MessageStatus } from '@prisma/client';
import axios from 'axios';

const META_API = 'https://graph.facebook.com/v20.0';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService, private mediaService: MediaService) {}

  private async findLeadECanal(tenantId: string, leadId: number) {
    const lead = await this.prisma.lead.findFirst({ where: { id_number: leadId, tenant_id: tenantId } });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const canal = await this.prisma.dmCanal.findFirst({ where: { tenant_id: tenantId, ativo: true } });
    if (!canal) throw new NotFoundException('Nenhum canal WhatsApp ativo encontrado.');

    return { lead, canal };
  }

  private lancarErroMeta(error: any): never {
    const metaError = error?.response?.data?.error;
    // Código 131047 = fora da janela de 24h de atendimento
    if (metaError?.code === 131047 || metaError?.code === 130472) {
      throw new BadRequestException(
        'Fora da janela de 24h. O cliente precisa enviar uma mensagem primeiro para você poder responder.',
      );
    }
    const msg = metaError?.message || error.message;
    throw new BadRequestException(`Erro ao enviar mensagem: ${msg}`);
  }

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
    const { lead, canal } = await this.findLeadECanal(tenantId, leadId);

    try {
      const response = await axios.post(
        `${META_API}/${canal.phone_number_id}/messages`,
        {
          messaging_product: 'whatsapp',
          to: lead.telefone,
          type: 'text',
          text: { body: texto },
        },
        { headers: { Authorization: `Bearer ${canal.access_token}` } },
      );

      const wamid = response.data?.messages?.[0]?.id;

      const [message] = await this.prisma.$transaction([
        this.prisma.message.create({
          data: {
            tenant_id: tenantId,
            canal_id: canal.id,
            lead_id: leadId,
            direction: MessageDirection.saida,
            content: texto,
            wamid,
            status: MessageStatus.enviado,
          },
        }),
        this.prisma.lead.update({
          where: { id_number: leadId },
          data: {
            last_message_at: new Date(),
            last_message_preview: texto.slice(0, 120),
          },
        }),
      ]);

      return message;
    } catch (error: any) {
      this.lancarErroMeta(error);
    }
  }

  // Envia áudio (nota de voz gravada no navegador ou arquivo anexado). Salva
  // uma cópia no volume de mídia e manda a Meta buscar por "link" — evita o
  // passo extra de upload direto pra Meta e reaproveita o /media já público.
  async replyMedia(tenantId: string, leadId: number, file: Express.Multer.File) {
    const { lead, canal } = await this.findLeadECanal(tenantId, leadId);
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');

    const relativeUrl = this.mediaService.saveBuffer(file.buffer, file.mimetype);
    const publicUrl = this.mediaService.publicUrl(relativeUrl);

    try {
      const response = await axios.post(
        `${META_API}/${canal.phone_number_id}/messages`,
        {
          messaging_product: 'whatsapp',
          to: lead.telefone,
          type: 'audio',
          audio: { link: publicUrl },
        },
        { headers: { Authorization: `Bearer ${canal.access_token}` } },
      );

      const wamid = response.data?.messages?.[0]?.id;
      const preview = '🎤 Áudio';

      const [message] = await this.prisma.$transaction([
        this.prisma.message.create({
          data: {
            tenant_id: tenantId,
            canal_id: canal.id,
            lead_id: leadId,
            direction: MessageDirection.saida,
            content: preview,
            media_url: relativeUrl,
            media_mime_type: file.mimetype,
            wamid,
            status: MessageStatus.enviado,
          },
        }),
        this.prisma.lead.update({
          where: { id_number: leadId },
          data: { last_message_at: new Date(), last_message_preview: preview },
        }),
      ]);

      return message;
    } catch (error: any) {
      this.lancarErroMeta(error);
    }
  }
}
