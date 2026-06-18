import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MetaService {
  constructor(private prisma: PrismaService) {}

  async getFirstCanal(tenantId: string) {
    const canal = await this.prisma.canal.findFirst({
      where: { tenant_id: tenantId, ativo: true },
      orderBy: { criado_em: 'asc' },
    });
    if (!canal) throw new NotFoundException('Nenhum canal configurado. Acesse Canais para adicionar um número WhatsApp.');
    return { ...canal, meta_access_token: '***REDACTED***' };
  }
}
