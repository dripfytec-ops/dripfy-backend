import {
  Controller, Get, Post, Patch, Param, Body,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantStatusDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { FinanceiroService } from '../financeiro/financeiro.service';
import { AssinaturaService } from '../assinatura/assinatura.service';
import { AtualizarPlanoDto } from '../assinatura/dto/atualizar-plano.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin_master)
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly authService: AuthService,
    private readonly financeiroService: FinanceiroService,
    private readonly assinaturaService: AssinaturaService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Master] Cria novo Tenant e Admin do Lojista' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '[Master] Lista todos os Tenants' })
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '[Master] Detalha um Tenant específico' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '[Master] Altera status de assinatura do Tenant' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenantsService.updateStatus(id, dto);
  }

  @Post(':id/impersonate')
  @ApiOperation({ summary: '[Master] Entra no Dashboard de um Tenant com visão unificada de lojista_admin' })
  impersonate(@Param('id') id: string, @CurrentUser('id') masterUserId: string) {
    return this.authService.impersonateTenant(masterUserId, id);
  }

  @Get(':id/extrato')
  @ApiOperation({ summary: '[Master] Extrato (conta corrente) de créditos de um Tenant específico' })
  getExtrato(@Param('id') id: string) {
    return this.financeiroService.getExtrato(id);
  }

  @Get(':id/mensalidade')
  @ApiOperation({ summary: '[Master] Plano, usuários e histórico de faturas de mensalidade de um Tenant' })
  getMensalidade(@Param('id') id: string) {
    return this.assinaturaService.getResumoParaMaster(id);
  }

  @Patch(':id/plano')
  @ApiOperation({ summary: '[Master] Ajusta manualmente o plano (valores/usuários inclusos) de um Tenant específico' })
  atualizarPlano(@Param('id') id: string, @Body() dto: AtualizarPlanoDto) {
    return this.assinaturaService.atualizarPlano(id, dto);
  }

  @Patch(':id/faturas/:faturaId/confirmar-pagamento')
  @ApiOperation({ summary: '[Master] Confirma manualmente o pagamento de uma fatura de mensalidade' })
  confirmarPagamentoMensalidade(@Param('faturaId') faturaId: string) {
    return this.assinaturaService.confirmarPagamento(faturaId);
  }

  @Get(':id/campanhas')
  @ApiOperation({ summary: '[Master] Campanhas (Disparo Próprio + Dripfy) de um Tenant específico' })
  getCampanhas(@Param('id') id: string) {
    return this.tenantsService.listarCampanhas(id);
  }
}
