import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULTS = [
  { nome: 'Balde Geral',         cor_hexadecimal: '#6B7280', ordem: 0, slug: 'balde_geral' },
  { nome: 'Aguardando Resposta', cor_hexadecimal: '#F59E0B', ordem: 1, slug: 'aguardando_resposta' },
  { nome: 'Em Atendimento',      cor_hexadecimal: '#3B82F6', ordem: 2, slug: 'em_atendimento' },
  { nome: 'Finalizado',          cor_hexadecimal: '#10B981', ordem: 3, slug: 'finalizado' },
];

@Injectable()
export class EtiquetasService {
  constructor(private prisma: PrismaService) {}

  async seedForTenant(tenantId: string) {
    for (const d of DEFAULTS) {
      await this.prisma.etiqueta.upsert({
        where: { tenant_id_slug: { tenant_id: tenantId, slug: d.slug } },
        update: {},
        create: { tenant_id: tenantId, ...d },
      });
    }
  }

  async findAll(tenantId: string) {
    return this.prisma.etiqueta.findMany({
      where: { tenant_id: tenantId },
      orderBy: { ordem: 'asc' },
    });
  }

  async create(tenantId: string, dto: { nome: string; cor_hexadecimal: string; ordem?: number }) {
    const count = await this.prisma.etiqueta.count({ where: { tenant_id: tenantId } });
    return this.prisma.etiqueta.create({
      data: { tenant_id: tenantId, nome: dto.nome, cor_hexadecimal: dto.cor_hexadecimal, ordem: dto.ordem ?? count },
    });
  }

  async update(tenantId: string, id: string, dto: { nome?: string; cor_hexadecimal?: string; ordem?: number }) {
    const etiqueta = await this.prisma.etiqueta.findFirst({ where: { id, tenant_id: tenantId } });
    if (!etiqueta) throw new NotFoundException('Etiqueta não encontrada.');
    return this.prisma.etiqueta.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    const etiqueta = await this.prisma.etiqueta.findFirst({ where: { id, tenant_id: tenantId } });
    if (!etiqueta) throw new NotFoundException('Etiqueta não encontrada.');
    if (etiqueta.slug) throw new NotFoundException('Etiquetas padrão não podem ser removidas.');
    await this.prisma.lead.updateMany({ where: { etiqueta_id: id }, data: { etiqueta_id: null } });
    return this.prisma.etiqueta.delete({ where: { id } });
  }

  async findBySlug(tenantId: string, slug: string) {
    return this.prisma.etiqueta.findUnique({ where: { tenant_id_slug: { tenant_id: tenantId, slug } } });
  }
}
