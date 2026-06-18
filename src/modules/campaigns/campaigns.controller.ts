import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/campaign.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria nova campanha conta-gotas' })
  create(@CurrentUser('tenant_id') tenantId: string, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista campanhas do tenant' })
  findAll(@CurrentUser('tenant_id') tenantId: string) {
    return this.campaignsService.findAll(tenantId);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Inicia a fila de disparo da campanha' })
  start(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string) {
    return this.campaignsService.start(tenantId, id);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pausa a campanha' })
  pause(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string) {
    return this.campaignsService.pause(tenantId, id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Estatísticas em tempo real da campanha' })
  stats(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string) {
    return this.campaignsService.getStats(tenantId, id);
  }
}
