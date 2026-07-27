import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { QuickRepliesService } from './quick-replies.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('quick-replies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quick-replies')
export class QuickRepliesController {
  constructor(private readonly service: QuickRepliesService) {}

  @Get()
  findAll(@CurrentUser('tenant_id') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Post()
  @Roles(UserRole.admin_master, UserRole.lojista_admin, UserRole.atendente)
  create(
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('nome') nome: string,
    @Body() dto: { titulo: string; texto: string },
  ) {
    return this.service.create(tenantId, dto, nome);
  }

  @Patch(':id')
  @Roles(UserRole.admin_master, UserRole.lojista_admin, UserRole.atendente)
  update(
    @CurrentUser('tenant_id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: { titulo?: string; texto?: string },
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin_master, UserRole.lojista_admin, UserRole.atendente)
  remove(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}
