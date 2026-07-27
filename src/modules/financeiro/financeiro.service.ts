import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PixGatewayService } from './pix-gateway.service';
import { ComprarCreditosDto } from './dto/financeiro.dto';
import { montarPayloadPixEstatico } from '../../common/utils/pix.util';

// Eventos da Asaas que indicam pagamento confirmado. Ajustar/expandir se o
// gateway definitivo for outro (ex: Mercado Pago usa 'payment.updated' +
// consulta de status, não um nome de evento fixo).
const EVENTOS_PAGAMENTO_CONFIRMADO = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];

// Preço praticado hoje: cobramos R$0,27 por crédito do parceiro; nosso custo
// de execução via JMD é de R$0,18 — margem de R$0,09/crédito. O preço
// nunca vem do cliente (evita fraude), sempre calculado aqui.
export const PRECO_CREDITO = 0.27;
export const CUSTO_CREDITO_JMD = 0.18;
export const QUANTIDADE_MINIMA_COMPRA = 2000;

@Injectable()
export class FinanceiroService {
  private readonly logger = new Logger(FinanceiroService.name);

  constructor(private prisma: PrismaService, private pixGateway: PixGatewayService) {}

  async comprarCreditos(tenantId: string, dto: ComprarCreditosDto) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    // valor_total nunca vem do cliente — sempre recalculado aqui pelo preço
    // vigente, pra ninguém conseguir comprar créditos abaixo do preço real.
    const valorTotal = Math.round(dto.quantidade_creditos * PRECO_CREDITO * 100) / 100;

    const invoice = await this.prisma.invoice.create({
      data: {
        tenant_id: tenantId,
        quantidade_creditos: dto.quantidade_creditos,
        valor_total: valorTotal,
        status: 'pendente',
        gateway: 'asaas',
      },
    });

    try {
      const cobranca = await this.pixGateway.criarCobrancaPix({
        valor: valorTotal,
        descricao: `Dripfy - ${dto.quantidade_creditos} créditos`,
        referenciaExterna: invoice.id,
        nomeCliente: tenant.nome_empresa,
      });

      return this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          gateway_payment_id: cobranca.gatewayPaymentId,
          pix_qrcode_base64: cobranca.qrCodeBase64,
          pix_copia_cola: cobranca.copiaCola,
        },
      });
    } catch (error) {
      // Não deixa uma invoice "pendente" órfã (sem cobrança real por trás) se
      // o gateway falhar ao gerar o QR Code.
      await this.prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'cancelado' } }).catch(() => {});
      throw error;
    }
  }

  // Cobrança PIX com valor fixo já embutido no QR, sem depender do gateway
  // automático (Asaas não configurado) — Master confirma o pagamento
  // manualmente, mesmo esquema usado em mensalidade/enriquecimento.
  async gerarCobrancaManual(tenantId: string, quantidade: number) {
    if (!quantidade || quantidade < QUANTIDADE_MINIMA_COMPRA) {
      throw new BadRequestException(`Quantidade mínima é ${QUANTIDADE_MINIMA_COMPRA} créditos.`);
    }
    const valorTotal = Math.round(quantidade * PRECO_CREDITO * 100) / 100;
    const pixCopiaCola = montarPayloadPixEstatico(valorTotal);

    return this.prisma.invoice.create({
      data: {
        tenant_id: tenantId,
        quantidade_creditos: quantidade,
        valor_total: valorTotal,
        gateway: 'manual',
        pix_copia_cola: pixCopiaCola,
      },
    });
  }

  // [Master] Confirma manualmente o pagamento de uma cobrança gerada via
  // gerarCobrancaManual (gateway: 'manual' — nunca chega webhook pra essas).
  async confirmarPagamentoManual(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Cobrança não encontrada.');
    if (invoice.status === 'pago') return invoice;

    const atualizada = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'pago', pago_em: new Date() } });
      const tenantAtualizado = await tx.tenant.update({
        where: { id: invoice.tenant_id },
        data: { creditos_saldo: { increment: invoice.quantidade_creditos } },
      });
      await this.registrarTransacao(tx, {
        tenantId: invoice.tenant_id,
        tipo: 'compra',
        quantidade: invoice.quantidade_creditos,
        saldoApos: tenantAtualizado.creditos_saldo,
        descricao: `Compra de ${invoice.quantidade_creditos} créditos via PIX`,
        invoiceId: invoice.id,
      });
      return inv;
    });

    await this.retomarCampanhasAguardandoRecarga(invoice.tenant_id);
    return atualizada;
  }

  // [Master] Cobranças de créditos Dripfy pendentes de um tenant específico.
  async listarInvoicesPendentes(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { tenant_id: tenantId, status: 'pendente' },
      orderBy: { criado_em: 'desc' },
    });
  }

  async getInvoice(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenant_id: tenantId } });
    if (!invoice) throw new NotFoundException('Cobrança não encontrada.');
    return invoice;
  }

  async getSaldo(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { creditos_saldo: true },
    });
    return { creditos_saldo: tenant.creditos_saldo };
  }

  // Extrato (conta corrente) do próprio tenant — usado pela tela do parceiro
  // em Disparo Dripfy > Créditos.
  async getExtrato(tenantId: string, limit = 100) {
    const [saldo, transacoes] = await Promise.all([
      this.getSaldo(tenantId),
      this.prisma.creditoTransacao.findMany({
        where: { tenant_id: tenantId },
        orderBy: { criado_em: 'desc' },
        take: limit,
      }),
    ]);
    return { creditos_saldo: saldo.creditos_saldo, valor_credito: PRECO_CREDITO, transacoes };
  }

  // Registra uma transação no ledger e retorna o registro criado. Não mexe
  // no saldo em si — quem chama já deve ter feito o increment/decrement
  // (evita incrementar duas vezes ou dessincronizar saldo_apos).
  async registrarTransacao(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      tipo: 'compra' | 'consumo' | 'ajuste';
      quantidade: number;
      saldoApos: number;
      descricao: string;
      campanhaId?: string;
      invoiceId?: string;
    },
  ) {
    return tx.creditoTransacao.create({
      data: {
        tenant_id: params.tenantId,
        tipo: params.tipo,
        quantidade: params.quantidade,
        saldo_apos: params.saldoApos,
        descricao: params.descricao,
        campanha_id: params.campanhaId,
        invoice_id: params.invoiceId,
      },
    });
  }

  // Processa o webhook de confirmação de pagamento do gateway. `token` é o
  // segredo compartilhado configurado no painel do gateway (ex: header
  // "asaas-access-token" na Asaas) — sem ele, qualquer um que descobrisse a
  // URL do webhook poderia se autoconceder créditos de graça.
  async processarWebhookPagamento(token: string | undefined, body: any) {
    const tokenEsperado = process.env.PIX_WEBHOOK_TOKEN;
    if (!tokenEsperado || token !== tokenEsperado) {
      throw new UnauthorizedException('Token de webhook inválido.');
    }

    const evento = body?.event;
    const paymentId = body?.payment?.id;
    if (!paymentId || !EVENTOS_PAGAMENTO_CONFIRMADO.includes(evento)) {
      return { status: 'ignored' };
    }

    const invoice = await this.prisma.invoice.findUnique({ where: { gateway_payment_id: paymentId } });
    if (!invoice) {
      this.logger.warn(`Webhook de pagamento recebido para gateway_payment_id desconhecido: ${paymentId}`);
      return { status: 'invoice_not_found' };
    }
    if (invoice.status === 'pago') return { status: 'already_processed' }; // idempotência: gateway pode reenviar o evento

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'pago', pago_em: new Date() } });
      const tenantAtualizado = await tx.tenant.update({
        where: { id: invoice.tenant_id },
        data: { creditos_saldo: { increment: invoice.quantidade_creditos } },
      });
      await this.registrarTransacao(tx, {
        tenantId: invoice.tenant_id,
        tipo: 'compra',
        quantidade: invoice.quantidade_creditos,
        saldoApos: tenantAtualizado.creditos_saldo,
        descricao: `Compra de ${invoice.quantidade_creditos} créditos via PIX`,
        invoiceId: invoice.id,
      });
    });

    await this.retomarCampanhasAguardandoRecarga(invoice.tenant_id);

    return { status: 'ok' };
  }

  // Retoma campanhas paradas por falta de crédito assim que o saldo do tenant
  // for suficiente para os contatos ainda pendentes daquela campanha.
  private async retomarCampanhasAguardandoRecarga(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;

    const campanhas = await this.prisma.dmCampanha.findMany({
      where: { tenant_id: tenantId, status: 'aguardando_recarga' },
      orderBy: { criado_em: 'asc' },
    });

    for (const campanha of campanhas) {
      const pendentes = await this.prisma.dmContato.count({ where: { campanha_id: campanha.id, status: 'pendente' } });
      if (pendentes > 0 && pendentes <= tenant.creditos_saldo) {
        await this.prisma.dmCampanha.update({ where: { id: campanha.id }, data: { status: 'agendada' } });
        this.logger.log(`Campanha ${campanha.id} retomada automaticamente após recarga de créditos.`);
      }
    }
  }
}
