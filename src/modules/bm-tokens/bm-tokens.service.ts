import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BmTokensService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.bmToken.findMany({
      where: { tenant_id: tenantId },
      orderBy: { criado_em: 'asc' },
    });
  }

  async create(tenantId: string, dto: { nome: string; token: string }) {
    return this.prisma.bmToken.create({
      data: { tenant_id: tenantId, nome: dto.nome, token: dto.token },
    });
  }

  async update(tenantId: string, id: string, dto: { nome?: string; token?: string }) {
    const bmToken = await this.prisma.bmToken.findFirst({ where: { id, tenant_id: tenantId } });
    if (!bmToken) throw new NotFoundException('Token de BM não encontrado.');
    return this.prisma.bmToken.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    const bmToken = await this.prisma.bmToken.findFirst({ where: { id, tenant_id: tenantId } });
    if (!bmToken) throw new NotFoundException('Token de BM não encontrado.');
    return this.prisma.bmToken.delete({ where: { id } });
  }
}
