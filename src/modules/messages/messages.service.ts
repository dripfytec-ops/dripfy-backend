import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
      include: {
        lead: { select: { nome: true, telefone: true } },
      },
    });
  }
}
