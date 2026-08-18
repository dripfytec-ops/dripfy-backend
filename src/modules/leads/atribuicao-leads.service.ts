import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

// Atribuição automática de leads de disparo externo entre vendedores online,
// respeitando um limite diário configurável por tenant (padrão 250 —
// mesma regra usada hoje no Vende Aí). Escolhe sempre o vendedor online com
// menos leads recebidos no dia (least-loaded), o que produz uma distribuição
// naturalmente equilibrada sem precisar guardar estado de rodízio.
@Injectable()
export class AtribuicaoLeadsService {
  constructor(private prisma: PrismaService) {}

  private inicioDoDiaSaoPaulo(): Date {
    const hojeSP = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    // "en-CA" formata como YYYY-MM-DD; meia-noite em São Paulo (UTC-3) é
    // 03:00 UTC do mesmo dia.
    return new Date(`${hojeSP}T03:00:00.000Z`);
  }

  // Retorna o id do vendedor escolhido, ou null se nenhum vendedor online
  // tiver vaga no limite diário (ou não houver ninguém online) — nesse caso
  // o lead fica sem vendedor, pra distribuição manual depois.
  async atribuirVendedorOnline(tenantId: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { limite_leads_dia_vendedor: true },
    });
    const limite = tenant?.limite_leads_dia_vendedor ?? 250;

    const vendedoresOnline = await this.prisma.user.findMany({
      where: { tenant_id: tenantId, role: UserRole.atendente, ativo: true, online: true },
      select: { id: true },
    });
    if (vendedoresOnline.length === 0) return null;

    const inicioDoDia = this.inicioDoDiaSaoPaulo();
    const contagens = await this.prisma.lead.groupBy({
      by: ['vendedor_id'],
      where: {
        tenant_id: tenantId,
        vendedor_id: { in: vendedoresOnline.map((v) => v.id) },
        criado_em: { gte: inicioDoDia },
      },
      _count: { vendedor_id: true },
    });
    const contagemPorVendedor = new Map(contagens.map((c) => [c.vendedor_id as string, c._count.vendedor_id]));

    let escolhido: string | null = null;
    let menorContagem = Infinity;
    for (const vendedor of vendedoresOnline) {
      const contagem = contagemPorVendedor.get(vendedor.id) ?? 0;
      if (contagem < limite && contagem < menorContagem) {
        menorContagem = contagem;
        escolhido = vendedor.id;
      }
    }
    return escolhido;
  }
}
