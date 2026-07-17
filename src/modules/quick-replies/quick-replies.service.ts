import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QuickRepliesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.quickReply.findMany({
      where: { tenant_id: tenantId },
      orderBy: { titulo: 'asc' },
    });
  }

  async create(tenantId: string, dto: { titulo: string; texto: string }) {
    return this.prisma.quickReply.create({
      data: { tenant_id: tenantId, titulo: dto.titulo, texto: dto.texto },
    });
  }

  async update(tenantId: string, id: string, dto: { titulo?: string; texto?: string }) {
    const reply = await this.prisma.quickReply.findFirst({ where: { id, tenant_id: tenantId } });
    if (!reply) throw new NotFoundException('Resposta rápida não encontrada.');
    return this.prisma.quickReply.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    const reply = await this.prisma.quickReply.findFirst({ where: { id, tenant_id: tenantId } });
    if (!reply) throw new NotFoundException('Resposta rápida não encontrada.');
    return this.prisma.quickReply.delete({ where: { id } });
  }
}
