import { Injectable, UnauthorizedException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, ativo: true },
      include: { tenant: true },
    });

    if (!user) throw new UnauthorizedException('Credenciais inválidas.');

    const passwordMatch = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordMatch) throw new UnauthorizedException('Credenciais inválidas.');

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id,
    };

    const access_token = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_SECRET', 'secret-change-me'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '7d'),
    });

    return {
      access_token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        tenant: {
          id: user.tenant.id,
          nome_empresa: user.tenant.nome_empresa,
          slug: user.tenant.slug,
        },
      },
    };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        tenant_id: true,
        tenant: {
          select: {
            id: true,
            nome_empresa: true,
            slug: true,
            status_assinatura: true,
          },
        },
      },
    });
  }

  // Emite um token temporário (2h) que faz o admin_master "entrar" num tenant
  // de cliente com visão unificada de lojista_admin, sem trocar de conta.
  async impersonateTenant(masterUserId: string, targetTenantId: string) {
    const master = await this.prisma.user.findUnique({ where: { id: masterUserId } });
    if (!master || master.role !== 'admin_master') {
      throw new ForbiddenException('Apenas o Master pode alternar de tenant.');
    }

    const tenantAlvo = await this.prisma.tenant.findUnique({ where: { id: targetTenantId } });
    if (!tenantAlvo) throw new NotFoundException('Tenant não encontrado.');

    const payload: JwtPayload = {
      sub: master.id,
      email: master.email,
      role: master.role,
      tenant_id: tenantAlvo.id,
      impersonated_from: master.tenant_id,
    };

    const access_token = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_SECRET', 'secret-change-me'),
      expiresIn: '2h',
    });

    return {
      access_token,
      user: {
        id: master.id,
        nome: master.nome,
        email: master.email,
        role: master.role,
        tenant_id: tenantAlvo.id,
        tenant: { id: tenantAlvo.id, nome_empresa: tenantAlvo.nome_empresa, slug: tenantAlvo.slug, status_assinatura: tenantAlvo.status_assinatura },
      },
    };
  }

  // Reemite o token original do Master a partir de uma sessão de impersonação.
  async voltarAoMaster(payload: JwtPayload) {
    if (!payload.impersonated_from) {
      throw new BadRequestException('Esta sessão não é uma impersonação de tenant.');
    }

    const master = await this.prisma.user.findFirst({
      where: { id: payload.sub, ativo: true },
      include: { tenant: true },
    });
    if (!master) throw new UnauthorizedException('Usuário master não encontrado.');

    const novoPayload: JwtPayload = {
      sub: master.id,
      email: master.email,
      role: master.role,
      tenant_id: master.tenant_id,
    };

    const access_token = await this.jwt.signAsync(novoPayload, {
      secret: this.config.get('JWT_SECRET', 'secret-change-me'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '7d'),
    });

    return {
      access_token,
      user: {
        id: master.id,
        nome: master.nome,
        email: master.email,
        role: master.role,
        tenant_id: master.tenant_id,
        tenant: { id: master.tenant.id, nome_empresa: master.tenant.nome_empresa, slug: master.tenant.slug, status_assinatura: master.tenant.status_assinatura },
      },
    };
  }
}
