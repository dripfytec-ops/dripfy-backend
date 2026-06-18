import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MetaService } from './meta.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('meta-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Get('config')
  @ApiOperation({ summary: 'Retorna primeiro canal ativo (legado)' })
  getConfig(@CurrentUser('tenant_id') tenantId: string) {
    return this.metaService.getFirstCanal(tenantId);
  }
}
