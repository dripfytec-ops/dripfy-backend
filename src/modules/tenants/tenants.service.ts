import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantStatusDto } from './dto/create-tenant.dto';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import { EtiquetasService } from '../etiquetas/etiquetas.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService, private etiquetasService: EtiquetasService) {}

  async create(dto: CreateTenantDto) {
    const slugExists = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (slugExists) throw new ConflictException(`Slug '${dto.slug}' já está em uso.`);

    const passwordHash = await bcrypt.hash(dto.admin_password, 12);

    const tenant = await this.prisma.tenant.create({
      data: {
        nome_empresa: dto.nome_empresa,
        slug: dto.slug,
        status_assinatura: SubscriptionStatus.trial,
        users: {
          create: {
            nome: dto.admin_nome,
            email: dto.admin_email,
            password_hash: passwordHash,
            role: UserRole.lojista_admin,
          },
        },
      },
      include: {
        users: {
          select: { id: true, nome: true, email: true, role: true },
        },
      },
    });

    await this.etiquetasService.seedForTenant(tenant.id);

    return tenant;
  }

  async findAll() {
    return this.prisma.tenant.findMany({
      include: {
        _count: { select: { users: true, leads: true } },
      },
      orderBy: { criado_em: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, nome: true, email: true, role: true, ativo: true } },
        dm_canais: { select: { id: true, nome: true, phone_number_id: true, ativo: true } },
        chatwoot_config: { select: { id: true, chatwoot_url: true } },
        _count: { select: { leads: true, dm_campanhas: true } },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant não encontrado.');
    return tenant;
  }

  async updateStatus(id: string, dto: UpdateTenantStatusDto) {
    await this.findOne(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { status_assinatura: dto.status_assinatura as SubscriptionStatus },
    });
  }
}
