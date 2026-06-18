import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CanaisService } from './canais.service';
import { CreateCanalDto, UpdateCanalDto } from './canais.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('canais')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('canais')
export class CanaisController {
  constructor(private readonly canaisService: CanaisService) {}

  @Post()
  @ApiOperation({ summary: 'Adiciona novo canal WhatsApp' })
  create(@CurrentUser('tenant_id') tenantId: string, @Body() dto: CreateCanalDto) {
    return this.canaisService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos os canais do tenant' })
  findAll(@CurrentUser('tenant_id') tenantId: string) {
    return this.canaisService.findAll(tenantId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza canal' })
  update(
    @CurrentUser('tenant_id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCanalDto,
  ) {
    return this.canaisService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove canal' })
  remove(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string) {
    return this.canaisService.remove(tenantId, id);
  }

  @Get(':id/templates')
  @ApiOperation({ summary: 'Lista templates aprovados do canal' })
  templates(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string) {
    return this.canaisService.listTemplates(tenantId, id);
  }
}
