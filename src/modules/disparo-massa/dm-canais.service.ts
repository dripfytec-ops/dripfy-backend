import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaService } from './meta.service';
import { CreateDmCanalDto, UpdateDmCanalDto } from './dto/dm-canal.dto';

const CANAL_SELECT = {
  id: true, nome: true, waba_id: true, phone_number_id: true, bm_nome: true,
  lote_size: true, delay_ms: true, template_boas_vindas: true, chatwoot_inbox_id: true,
  ativo: true, criado_em: true,
};

@Injectable()
export class DmCanaisService {
  constructor(private prisma: PrismaService, private meta: MetaService) {}

  async create(tenantId: string, dto: CreateDmCanalDto) {
    return this.prisma.dmCanal.create({ data: { tenant_id: tenantId, ...dto }, select: CANAL_SELECT });
  }

  async findAll(tenantId: string) {
    return this.prisma.dmCanal.findMany({
      where: { tenant_id: tenantId, ativo: true },
      orderBy: { criado_em: 'asc' },
      select: CANAL_SELECT,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateDmCanalDto) {
    await this.ensureOwner(tenantId, id);
    const { access_token, ...rest } = dto;
    return this.prisma.dmCanal.update({
      where: { id },
      data: { ...rest, ...(access_token ? { access_token } : {}) },
      select: CANAL_SELECT,
    });
  }

  async findCredenciais(tenantId: string, id: string) {
    const canal = await this.prisma.dmCanal.findFirst({ where: { id, tenant_id: tenantId } });
    if (!canal) throw new NotFoundException('Canal não encontrado.');
    return canal;
  }

  async findByPhoneNumberId(tenantId: string, phoneNumberId: string) {
    return this.prisma.dmCanal.findFirst({ where: { tenant_id: tenantId, phone_number_id: phoneNumberId, ativo: true } });
  }

  async findByPhoneNumberIdGlobal(phoneNumberId: string) {
    return this.prisma.dmCanal.findFirst({ where: { phone_number_id: phoneNumberId, ativo: true } });
  }

  async findFirstActive(tenantId: string) {
    return this.prisma.dmCanal.findFirst({ where: { tenant_id: tenantId, ativo: true }, orderBy: { criado_em: 'asc' } });
  }

  async listarTemplatesDoCanal(tenantId: string, canalId: string) {
    const canal = await this.findCredenciais(tenantId, canalId);
    return this.meta.listarTemplates({ wabaId: canal.waba_id, accessToken: canal.access_token });
  }

  // Qualidade (GREEN/YELLOW/RED) + custo real dos últimos 30 dias, direto da
  // Meta, por canal ativo. Falha isolada de um canal não derruba os outros.
  async obterStatusCanais(tenantId: string) {
    const canais = await this.prisma.dmCanal.findMany({
      where: { tenant_id: tenantId, ativo: true },
      orderBy: { criado_em: 'asc' },
    });
    return Promise.all(canais.map(async (c) => {
      try {
        const [info, custo] = await Promise.all([
          this.meta.obterInfoNumero({ phoneNumberId: c.phone_number_id, accessToken: c.access_token }),
          this.meta.obterCustoWaba({ wabaId: c.waba_id, accessToken: c.access_token }),
        ]);
        return {
          canal_id: c.id, nome: c.nome,
          quality_rating: info.quality_rating || null,
          throughput_level: info.throughput?.level || null,
          moeda: custo.moeda, volume_30d: custo.volume, custo_30d: custo.custo,
          custo_medio: custo.volume > 0 ? custo.custo / custo.volume : 0,
          erro: null,
        };
      } catch (e: any) {
        return {
          canal_id: c.id, nome: c.nome, quality_rating: null, throughput_level: null,
          moeda: null, volume_30d: 0, custo_30d: 0, custo_medio: 0, erro: e.message,
        };
      }
    }));
  }

  private async ensureOwner(tenantId: string, id: string) {
    const canal = await this.prisma.dmCanal.findUnique({ where: { id } });
    if (!canal) throw new NotFoundException('Canal não encontrado.');
    if (canal.tenant_id !== tenantId) throw new ForbiddenException('Acesso negado.');
    return canal;
  }
}
