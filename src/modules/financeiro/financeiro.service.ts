import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PixGatewayService } from './pix-gateway.service';
import { ComprarCreditosDto } from './dto/financeiro.dto';

// Eventos da Asaas que indicam pagamento confirmado. Ajustar/expandir se o
// gateway definitivo for outro (ex: Mercado Pago usa 'payment.updated' +
// consulta de status, não um nome de evento fixo).
const EVENTOS_PAGAMENTO_CONFIRMADO = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];

@Injectable()
export class FinanceiroService {
  private readonly logger = new Logger(FinanceiroService.name);

  constructor(private prisma: PrismaService, private pixGateway: PixGatewayService) {}

  async comprarCreditos(tenantId: string, dto: ComprarCreditosDto) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const invoice = await this.prisma.invoice.create({
      data: {
        tenant_id: tenantId,
        quantidade_creditos: dto.quantidade_creditos,
        valor_total: dto.valor_total,
        status: 'pendente',
        gateway: 'asaas',
      },
    });

    try {
      const cobranca = await this.pixGateway.criarCobrancaPix({
        valor: dto.valor_total,
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

    await this.prisma.$transaction([
      this.prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'pago', pago_em: new Date() } }),
      this.prisma.tenant.update({
        where: { id: invoice.tenant_id },
        data: { creditos_saldo: { increment: invoice.quantidade_creditos } },
      }),
    ]);

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
