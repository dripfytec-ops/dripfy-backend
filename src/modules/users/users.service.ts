import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  nome: string;
  email: string;
  password: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateUserDto) {
    const exists = await this.prisma.user.findFirst({
      where: { tenant_id: tenantId, email: dto.email },
    });
    if (exists) throw new ConflictException('E-mail já cadastrado neste tenant.');

    const password_hash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: { tenant_id: tenantId, nome: dto.nome, email: dto.email, password_hash, role: dto.role },
      select: { id: true, nome: true, email: true, role: true, ativo: true },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, nome: true, email: true, role: true, ativo: true, criado_em: true },
      orderBy: { nome: 'asc' },
    });
  }

  async toggleActive(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenant_id: tenantId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return this.prisma.user.update({
      where: { id: userId },
      data: { ativo: !user.ativo },
      select: { id: true, nome: true, ativo: true },
    });
  }
}
