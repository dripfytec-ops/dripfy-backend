import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceiroService } from './financeiro.service';
import { ComprarCreditosDto } from './dto/financeiro.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('financeiro')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('financeiro')
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Post('comprar-creditos')
  @ApiOperation({ summary: 'Gera cobrança PIX pra compra de créditos' })
  comprarCreditos(@CurrentUser('tenant_id') tenantId: string, @Body() dto: ComprarCreditosDto) {
    return this.financeiroService.comprarCreditos(tenantId, dto);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Status de uma cobrança (usado pelo polling do modal PIX)' })
  getInvoice(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string) {
    return this.financeiroService.getInvoice(tenantId, id);
  }

  @Get('saldo')
  @ApiOperation({ summary: 'Saldo de créditos do tenant' })
  getSaldo(@CurrentUser('tenant_id') tenantId: string) {
    return this.financeiroService.getSaldo(tenantId);
  }

  @Get('extrato')
  @ApiOperation({ summary: 'Extrato (conta corrente) de créditos do tenant' })
  getExtrato(@CurrentUser('tenant_id') tenantId: string) {
    return this.financeiroService.getExtrato(tenantId);
  }
}
