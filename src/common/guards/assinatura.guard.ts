import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

const METODOS_BLOQUEAVEIS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Bloqueia ações de escrita quando a assinatura mensal do tenant está em
// atraso (Tenant.assinatura_bloqueada). Leitura (GET) e login continuam
// liberados — o lojista consegue entrar e ver o sistema, só não consegue
// mais criar/editar nada até regularizar o pagamento.
//
// Faz sua própria verificação de JWT (em vez de depender do req.user já
// populado pelo Passport) porque roda como guard global, antes dos guards
// de rota — assim funciona em qualquer controller sem precisar decorar
// cada um manualmente. Token ausente/inválido não é problema deste guard:
// quem barra isso é o JwtAuthGuard de cada rota autenticada.
@Injectable()
export class AssinaturaGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!METODOS_BLOQUEAVEIS.includes(req.method)) return true;

    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return true;

    let payload: { sub: string; tenant_id: string };
    try {
      payload = this.jwt.verify(authHeader.slice(7));
    } catch {
      return true;
    }

    const user = await this.prisma.user.findFirst({ where: { id: payload.sub, ativo: true }, select: { role: true } });
    // admin_master nunca é bloqueado — inclusive enquanto impersona um
    // tenant em atraso, precisa continuar operando pra poder resolver.
    if (!user || user.role === 'admin_master') return true;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: payload.tenant_id },
      select: { assinatura_bloqueada: true },
    });
    if (tenant?.assinatura_bloqueada) {
      throw new HttpException(
        { code: 'ASSINATURA_ATRASADA', message: 'Sua assinatura está em atraso. Regularize o pagamento para continuar.' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }
}
