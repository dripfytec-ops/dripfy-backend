import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.admin_master, UserRole.lojista_admin)
  @ApiOperation({ summary: 'Cria novo usuário no tenant' })
  create(
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('role') callerRole: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(tenantId, dto, callerRole);
  }

  @Get()
  @Roles(UserRole.admin_master, UserRole.lojista_admin)
  @ApiOperation({ summary: 'Lista usuários do tenant' })
  findAll(@CurrentUser('tenant_id') tenantId: string) {
    return this.usersService.findAll(tenantId);
  }

  @Patch(':id/toggle')
  @Roles(UserRole.admin_master, UserRole.lojista_admin)
  @ApiOperation({ summary: 'Ativa/desativa usuário' })
  toggleActive(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.usersService.toggleActive(tenantId, id, role);
  }

  @Patch(':id/reset-password')
  @Roles(UserRole.admin_master, UserRole.lojista_admin)
  @ApiOperation({ summary: 'Redefine senha de um usuário' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: { new_password: string },
    @CurrentUser('role') role: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.resetPassword(id, dto.new_password, role, tenantId);
  }

  @Patch(':id')
  @Roles(UserRole.admin_master, UserRole.lojista_admin)
  @ApiOperation({ summary: 'Atualiza nome/email de um usuário' })
  update(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin_master, UserRole.lojista_admin)
  @ApiOperation({ summary: 'Remove um usuário do tenant' })
  remove(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') callerId: string,
  ) {
    return this.usersService.remove(tenantId, id, callerId);
  }
}
