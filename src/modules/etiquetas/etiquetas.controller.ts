import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EtiquetasService } from './etiquetas.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('etiquetas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('etiquetas')
export class EtiquetasController {
  constructor(private readonly service: EtiquetasService) {}

  @Get()
  findAll(@CurrentUser('tenant_id') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Post()
  @Roles(UserRole.admin_master, UserRole.lojista_admin, UserRole.atendente)
  create(
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('nome') nome: string,
    @Body() dto: { nome: string; cor_hexadecimal: string; ordem?: number },
  ) {
    return this.service.create(tenantId, dto, nome);
  }

  @Patch(':id')
  @Roles(UserRole.admin_master, UserRole.lojista_admin, UserRole.atendente)
  update(
    @CurrentUser('tenant_id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: { nome?: string; cor_hexadecimal?: string; ordem?: number },
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin_master, UserRole.lojista_admin, UserRole.atendente)
  remove(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}
