import { Injectable, Logger, NotFoundException, OnModuleInit, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, Tenant } from '@prisma/client';
import { montarPayloadPixEstatico } from '../../common/utils/pix.util';
import { AtualizarPlanoDto } from './dto/atualizar-plano.dto';

const DIAS_CARENCIA = 5;
const ROLES_QUE_CONTAM_COMO_ASSENTO: UserRole[] = ['lojista_admin', 'atendente'];

@Injectable()
export class AssinaturaService implements OnModuleInit {
  private readonly logger = new Logger(AssinaturaService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.rodarCicloCobranca().catch((e) => this.logger.error(`rodarCicloCobranca: ${e.message}`));
    this.verificarInadimplencia().catch((e) => this.logger.error(`verificarInadimplencia: ${e.message}`));
    setInterval(() => {
      this.rodarCicloCobranca().catch((e) => this.logger.error(`rodarCicloCobranca: ${e.message}`));
      this.verificarInadimplencia().catch((e) => this.logger.error(`verificarInadimplencia: ${e.message}`));
    }, 3_600_000); // de hora em hora é suficiente pra um ciclo mensal
  }

  async contarUsuarios(tenantId: string): Promise<number> {
    return this.prisma.user.count({ where: { tenant_id: tenantId, role: { in: ROLES_QUE_CONTAM_COMO_ASSENTO } } });
  }

  calcularValorMensal(tenant: Pick<Tenant, 'usuarios_inclusos' | 'valor_mensalidade_base' | 'valor_usuario_adicional'>, usuarios: number) {
    const usuariosExtras = Math.max(0, usuarios - tenant.usuarios_inclusos);
    const valorTotal =
      Number(tenant.valor_mensalidade_base) + usuariosExtras * Number(tenant.valor_usuario_adicional);
    return { usuariosExtras, valorTotal: Math.round(valorTotal * 100) / 100 };
  }

  private competenciaAtual(): string {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  }

  // Roda periodicamente: gera a fatura do mês pra todo tenant ativo cuja
  // data de próxima cobrança já chegou.
  async rodarCicloCobranca() {
    const agora = new Date();
    const tenants = await this.prisma.tenant.findMany({
      where: { status_assinatura: 'ativo', proxima_cobranca_em: { lte: agora } },
    });

    for (const tenant of tenants) {
      try {
        await this.gerarFatura(tenant);
      } catch (e: any) {
        this.logger.error(`gerarFatura tenant ${tenant.id}: ${e.message}`);
      }
    }
  }

  private async gerarFatura(tenant: Tenant) {
    const competencia = this.competenciaAtual();
    const usuarios = await this.contarUsuarios(tenant.id);
    const { usuariosExtras, valorTotal } = this.calcularValorMensal(tenant, usuarios);

    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + DIAS_CARENCIA);

    const pixCopiaCola = montarPayloadPixEstatico(valorTotal);

    await this.prisma.$transaction(async (tx) => {
      // @@unique([tenant_id, competencia]) evita duplicar se o ciclo rodar
      // mais de uma vez no mesmo mês (ex: dois processos concorrentes).
      await tx.mensalidadeFatura.upsert({
        where: { tenant_id_competencia: { tenant_id: tenant.id, competencia } },
        create: {
          tenant_id: tenant.id,
          competencia,
          usuarios_cobrados: usuarios,
          usuarios_extras: usuariosExtras,
          valor_total: valorTotal,
          vencimento,
          pix_copia_cola: pixCopiaCola,
        },
        update: {},
      });

      const proxima = new Date(tenant.proxima_cobranca_em || new Date());
      proxima.setMonth(proxima.getMonth() + 1);
      await tx.tenant.update({ where: { id: tenant.id }, data: { proxima_cobranca_em: proxima } });
    });

    this.logger.log(`Fatura ${competencia} gerada pro tenant ${tenant.id}: R$${valorTotal} (${usuariosExtras} extras)`);
  }

  // Roda periodicamente: bloqueia tenants com fatura vencida e não paga.
  async verificarInadimplencia() {
    const agora = new Date();
    const faturasVencidas = await this.prisma.mensalidadeFatura.findMany({
      where: { status: 'pendente', vencimento: { lt: agora } },
      select: { tenant_id: true },
      distinct: ['tenant_id'],
    });

    const tenantIds = faturasVencidas.map((f) => f.tenant_id);
    if (tenantIds.length === 0) return;

    await this.prisma.tenant.updateMany({
      where: { id: { in: tenantIds }, assinatura_bloqueada: false },
      data: { assinatura_bloqueada: true },
    });
  }

  // Status da assinatura pro próprio lojista (tela /dashboard/assinatura).
  async getStatus(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const usuarios = await this.contarUsuarios(tenantId);
    const { usuariosExtras, valorTotal } = this.calcularValorMensal(tenant, usuarios);

    const faturaPendente = await this.prisma.mensalidadeFatura.findFirst({
      where: { tenant_id: tenantId, status: 'pendente' },
      orderBy: { criado_em: 'desc' },
    });

    return {
      usuarios_inclusos: tenant.usuarios_inclusos,
      valor_mensalidade_base: tenant.valor_mensalidade_base,
      valor_usuario_adicional: tenant.valor_usuario_adicional,
      usuarios_atual: usuarios,
      usuarios_extras_atual: usuariosExtras,
      valor_mensal_atual: valorTotal,
      assinatura_bloqueada: tenant.assinatura_bloqueada,
      proxima_cobranca_em: tenant.proxima_cobranca_em,
      fatura_pendente: faturaPendente,
    };
  }

  // [Master] Resumo de plano/mensalidade de um tenant específico (aba Dados
  // Cadastrais / Histórico do painel de Lojistas).
  async getResumoParaMaster(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    const usuarios = await this.contarUsuarios(tenantId);
    const { usuariosExtras, valorTotal } = this.calcularValorMensal(tenant, usuarios);

    const faturas = await this.prisma.mensalidadeFatura.findMany({
      where: { tenant_id: tenantId },
      orderBy: { criado_em: 'desc' },
      take: 24,
    });

    return {
      usuarios_inclusos: tenant.usuarios_inclusos,
      valor_mensalidade_base: tenant.valor_mensalidade_base,
      valor_usuario_adicional: tenant.valor_usuario_adicional,
      usuarios_atual: usuarios,
      usuarios_extras_atual: usuariosExtras,
      valor_mensal_atual: valorTotal,
      assinatura_bloqueada: tenant.assinatura_bloqueada,
      proxima_cobranca_em: tenant.proxima_cobranca_em,
      faturas,
    };
  }

  // [Master] Ajusta manualmente o plano (valores/inclusos) de um tenant
  // específico — override por cliente, além do padrão do Pacote Start.
  async atualizarPlano(tenantId: string, dto: AtualizarPlanoDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.usuarios_inclusos != null ? { usuarios_inclusos: dto.usuarios_inclusos } : {}),
        ...(dto.valor_mensalidade_base != null ? { valor_mensalidade_base: dto.valor_mensalidade_base } : {}),
        ...(dto.valor_usuario_adicional != null ? { valor_usuario_adicional: dto.valor_usuario_adicional } : {}),
      },
    });
  }

  // [Master] Confirma manualmente o pagamento de uma fatura (mesmo padrão do
  // "aprovar" das demandas Dripfy — sem gateway automático configurado).
  async confirmarPagamento(faturaId: string) {
    const fatura = await this.prisma.mensalidadeFatura.findUnique({ where: { id: faturaId } });
    if (!fatura) throw new NotFoundException('Fatura não encontrada.');
    if (fatura.status === 'pago') return fatura;

    const atualizada = await this.prisma.mensalidadeFatura.update({
      where: { id: faturaId },
      data: { status: 'pago', pago_em: new Date() },
    });

    // Só desbloqueia se não houver nenhuma outra fatura vencida em aberto.
    const outraPendenteVencida = await this.prisma.mensalidadeFatura.findFirst({
      where: { tenant_id: fatura.tenant_id, status: 'pendente', vencimento: { lt: new Date() } },
    });
    if (!outraPendenteVencida) {
      await this.prisma.tenant.update({ where: { id: fatura.tenant_id }, data: { assinatura_bloqueada: false } });
    }

    return atualizada;
  }
}
