import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AssinaturaService } from './assinatura.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('assinatura')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assinatura')
export class AssinaturaController {
  constructor(private readonly assinaturaService: AssinaturaService) {}

  @Get('status')
  @ApiOperation({ summary: 'Status da assinatura (plano, usuários, valor mensal e fatura pendente) do tenant' })
  getStatus(@CurrentUser('tenant_id') tenantId: string) {
    return this.assinaturaService.getStatus(tenantId);
  }
}
