import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { montarPayloadPixEstatico } from '../../common/utils/pix.util';

@Injectable()
export class EnriquecimentoService {
  constructor(private prisma: PrismaService) {}

  // Cria a solicitação e já debita o saldo (1 crédito = 1 lead) — o lojista
  // informa a quantidade porque não fazemos parsing automático da planilha.
  async criar(tenantId: string, nomeArquivo: string, arquivoUrl: string, quantidadeLeads: number, observacoes?: string) {
    if (!quantidadeLeads || quantidadeLeads <= 0) {
      throw new BadRequestException('Informe a quantidade de leads da planilha.');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (tenant.creditos_enriquecimento_saldo < quantidadeLeads) {
      throw new BadRequestException('Saldo de créditos de enriquecimento insuficiente. Adicione créditos antes de enviar a planilha.');
    }

    return this.prisma.$transaction(async (tx) => {
      const tenantAtualizado = await tx.tenant.update({
        where: { id: tenantId },
        data: { creditos_enriquecimento_saldo: { decrement: quantidadeLeads } },
      });

      const solicitacao = await tx.enriquecimentoSolicitacao.create({
        data: {
          tenant_id: tenantId,
          nome_arquivo_original: nomeArquivo,
          arquivo_original_url: arquivoUrl,
          quantidade_leads: quantidadeLeads,
          observacoes,
        },
      });

      await tx.enriquecimentoTransacao.create({
        data: {
          tenant_id: tenantId,
          tipo: 'consumo',
          quantidade: -quantidadeLeads,
          saldo_apos: tenantAtualizado.creditos_enriquecimento_saldo,
          descricao: `Consumo — planilha "${nomeArquivo}" (${quantidadeLeads} leads)`,
          solicitacao_id: solicitacao.id,
        },
      });

      return solicitacao;
    });
  }

  async listar(tenantId: string) {
    return this.prisma.enriquecimentoSolicitacao.findMany({
      where: { tenant_id: tenantId },
      orderBy: { criado_em: 'desc' },
    });
  }

  // [Master] Lista de todos os tenants, pendentes primeiro.
  async listarParaMaster() {
    return this.prisma.enriquecimentoSolicitacao.findMany({
      orderBy: [{ status: 'asc' }, { criado_em: 'desc' }],
      include: { tenant: { select: { id: true, nome_empresa: true, slug: true } } },
    });
  }

  // [Master] Devolve o arquivo já higienizado, marcando a solicitação como concluída.
  async concluir(id: string, arquivoProcessadoUrl: string, concluidoPor: string) {
    const solicitacao = await this.prisma.enriquecimentoSolicitacao.findUnique({ where: { id } });
    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada.');

    return this.prisma.enriquecimentoSolicitacao.update({
      where: { id },
      data: {
        status: 'concluido',
        arquivo_processado_url: arquivoProcessadoUrl,
        concluido_em: new Date(),
        concluido_por: concluidoPor,
      },
    });
  }

  // ─── Saldo de créditos de enriquecimento (conta corrente separada) ───────

  async getSaldoEExtrato(tenantId: string, limit = 100) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { creditos_enriquecimento_saldo: true, valor_credito_enriquecimento: true },
    });
    const transacoes = await this.prisma.enriquecimentoTransacao.findMany({
      where: { tenant_id: tenantId },
      orderBy: { criado_em: 'desc' },
      take: limit,
    });
    return {
      creditos_saldo: tenant.creditos_enriquecimento_saldo,
      valor_credito: tenant.valor_credito_enriquecimento,
      transacoes,
    };
  }

  async comprarCreditos(tenantId: string, quantidade: number) {
    if (!quantidade || quantidade <= 0) throw new BadRequestException('Quantidade inválida.');
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    // Preço nunca vem do cliente — sempre recalculado aqui.
    const valorTotal = Math.round(quantidade * Number(tenant.valor_credito_enriquecimento) * 100) / 100;
    const pixCopiaCola = montarPayloadPixEstatico(valorTotal);

    return this.prisma.enriquecimentoCompraCredito.create({
      data: { tenant_id: tenantId, quantidade_creditos: quantidade, valor_total: valorTotal, pix_copia_cola: pixCopiaCola },
    });
  }

  // [Master] Lista compras de créditos pendentes/recentes (todos os tenants).
  async listarComprasParaMaster() {
    return this.prisma.enriquecimentoCompraCredito.findMany({
      orderBy: [{ status: 'asc' }, { criado_em: 'desc' }],
      include: { tenant: { select: { id: true, nome_empresa: true, slug: true } } },
    });
  }

  // [Master] Confirma manualmente o pagamento de uma compra de créditos.
  async confirmarPagamentoCompra(compraId: string) {
    const compra = await this.prisma.enriquecimentoCompraCredito.findUnique({ where: { id: compraId } });
    if (!compra) throw new NotFoundException('Compra não encontrada.');
    if (compra.status === 'pago') return compra;

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.enriquecimentoCompraCredito.update({
        where: { id: compraId },
        data: { status: 'pago', pago_em: new Date() },
      });

      const tenantAtualizado = await tx.tenant.update({
        where: { id: compra.tenant_id },
        data: { creditos_enriquecimento_saldo: { increment: compra.quantidade_creditos } },
      });

      await tx.enriquecimentoTransacao.create({
        data: {
          tenant_id: compra.tenant_id,
          tipo: 'compra',
          quantidade: compra.quantidade_creditos,
          saldo_apos: tenantAtualizado.creditos_enriquecimento_saldo,
          descricao: `Compra de ${compra.quantidade_creditos} créditos via PIX`,
          compra_id: compra.id,
        },
      });

      return atualizada;
    });
  }
}
