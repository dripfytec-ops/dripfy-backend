import { Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IsString, IsEmail, IsOptional, IsEnum, MinLength, IsNotEmpty } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { AssinaturaService, ROLES_QUE_CONTAM_COMO_ASSENTO } from '../assinatura/assinatura.service';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private assinatura: AssinaturaService,
  ) {}

  async create(tenantId: string, dto: CreateUserDto) {
    const exists = await this.prisma.user.findFirst({
      where: { tenant_id: tenantId, email: dto.email },
    });
    if (exists) throw new ConflictException('E-mail já cadastrado neste tenant.');

    const password_hash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: { tenant_id: tenantId, nome: dto.nome, email: dto.email, password_hash, role: dto.role },
      select: { id: true, nome: true, email: true, role: true, ativo: true },
    });

    // Usuário além do plano (assento extra): gera cobrança avulsa paga
    // antecipadamente, na hora, em vez de esperar o próximo ciclo mensal.
    let cobranca_pendente: Awaited<ReturnType<AssinaturaService['criarCobrancaSeExcedeuPlano']>> = null;
    if (ROLES_QUE_CONTAM_COMO_ASSENTO.includes(dto.role)) {
      cobranca_pendente = await this.assinatura.criarCobrancaSeExcedeuPlano(tenantId, user.id);
    }

    return { ...user, cobranca_pendente };
  }

  async findAll(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, nome: true, email: true, role: true, ativo: true, criado_em: true },
      orderBy: { nome: 'asc' },
    });
  }

  async toggleActive(tenantId: string, userId: string, callerRole: string) {
    const where = callerRole === UserRole.admin_master
      ? { id: userId }
      : { id: userId, tenant_id: tenantId };
    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return this.prisma.user.update({
      where: { id: userId },
      data: { ativo: !user.ativo },
      select: { id: true, nome: true, ativo: true },
    });
  }

  async resetPassword(userId: string, newPassword: string, callerRole: string, callerTenantId: string) {
    const where = callerRole === UserRole.admin_master
      ? { id: userId }
      : { id: userId, tenant_id: callerTenantId };
    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    const password_hash = await bcrypt.hash(newPassword, 12);
    return this.prisma.user.update({
      where: { id: userId },
      data: { password_hash },
      select: { id: true, nome: true, email: true },
    });
  }

  async update(tenantId: string, userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenant_id: tenantId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (dto.email && dto.email !== user.email) {
      const conflict = await this.prisma.user.findFirst({ where: { tenant_id: tenantId, email: dto.email } });
      if (conflict) throw new ConflictException('E-mail já em uso neste tenant.');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { ...(dto.nome && { nome: dto.nome }), ...(dto.email && { email: dto.email }) },
      select: { id: true, nome: true, email: true, role: true, ativo: true },
    });
  }

  async remove(tenantId: string, userId: string, callerId: string) {
    if (userId === callerId) throw new ForbiddenException('Você não pode excluir sua própria conta.');
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenant_id: tenantId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    await this.prisma.user.delete({ where: { id: userId } });
    return { deleted: true };
  }
}
