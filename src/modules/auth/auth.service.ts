import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

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
}
