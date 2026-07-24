import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenant_id: string;
  // Presente só em tokens de impersonação (admin_master "entrando como" um
  // tenant): guarda o tenant_id ORIGINAL do master, pra permitir voltar.
  impersonated_from?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET', 'secret-change-me'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, ativo: true },
      include: { tenant: true },
    });

    if (!user) throw new UnauthorizedException('Token inválido ou usuário inativo.');

    // Impersonação: só é aceita se o token foi assinado com impersonated_from
    // (portanto veio de AuthService.impersonateTenant, protegido por
    // @Roles(admin_master)) E o usuário real por trás do token (buscado no
    // banco, não confiado do payload) de fato é admin_master. Isso evita que
    // um payload adulterado force acesso a outro tenant — mas como o JWT é
    // assinado, adulteração só seria possível com o JWT_SECRET vazado, o
    // mesmo risco de qualquer outro campo do token.
    if (payload.impersonated_from && user.role === 'admin_master' && payload.tenant_id !== user.tenant_id) {
      const tenantAlvo = await this.prisma.tenant.findUnique({ where: { id: payload.tenant_id } });
      if (!tenantAlvo) throw new UnauthorizedException('Tenant de destino não encontrado.');
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        nome: user.nome,
        tenant_id: tenantAlvo.id,
        tenant: tenantAlvo,
        impersonated_from: payload.impersonated_from,
      };
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      nome: user.nome,
      tenant_id: user.tenant_id,
      tenant: user.tenant,
    };
  }
}
