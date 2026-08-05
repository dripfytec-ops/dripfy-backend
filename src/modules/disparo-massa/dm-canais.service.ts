import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaService } from './meta.service';
import { CreateDmCanalDto, UpdateDmCanalDto } from './dto/dm-canal.dto';

const CANAL_SELECT = {
  id: true, nome: true, telefone: true, waba_id: true, phone_number_id: true, bm_nome: true,
  lote_size: true, delay_ms: true, template_boas_vindas: true, chatwoot_inbox_id: true,
  ativo: true, criado_em: true,
};

// Só uma prévia visual do token (nunca o valor completo) — o token
// completo nunca deve trafegar de volta pro navegador.
function tokenPreview(accessToken: string): string {
  return accessToken.length > 10 ? `${accessToken.slice(0, 10)}...` : '...';
}

@Injectable()
export class DmCanaisService {
  constructor(private prisma: PrismaService, private meta: MetaService) {}

  async create(tenantId: string, dto: CreateDmCanalDto) {
    return this.prisma.dmCanal.create({ data: { tenant_id: tenantId, ...dto }, select: CANAL_SELECT });
  }

  async findAll(tenantId: string) {
    const canais = await this.prisma.dmCanal.findMany({
      where: { tenant_id: tenantId, ativo: true },
      orderBy: { criado_em: 'asc' },
      select: { ...CANAL_SELECT, access_token: true },
    });
    return canais.map(({ access_token, ...c }) => ({ ...c, token_preview: tokenPreview(access_token) }));
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

  // Cotação USD→BRL em cache por 10min — evita bater na API de câmbio a
  // cada carregamento da tela de canais.
  private cotacaoUsdBrl: { valor: number; expiraEm: number } | null = null;

  private async obterCotacaoUsdBrl(): Promise<number | null> {
    if (this.cotacaoUsdBrl && this.cotacaoUsdBrl.expiraEm > Date.now()) return this.cotacaoUsdBrl.valor;
    try {
      const { data } = await axios.get('https://economia.awesomeapi.com.br/last/USD-BRL', { timeout: 5000 });
      const valor = parseFloat(data?.USDBRL?.bid);
      if (!valor) return null;
      this.cotacaoUsdBrl = { valor, expiraEm: Date.now() + 10 * 60_000 };
      return valor;
    } catch {
      return null;
    }
  }

  // Qualidade (GREEN/YELLOW/RED) + custo real dos últimos 30 dias, direto da
  // Meta, por canal ativo. Falha isolada de um canal não derruba os outros.
  async obterStatusCanais(tenantId: string) {
    const canais = await this.prisma.dmCanal.findMany({
      where: { tenant_id: tenantId, ativo: true },
      orderBy: { criado_em: 'asc' },
    });
    const cotacao = await this.obterCotacaoUsdBrl();
    return Promise.all(canais.map(async (c) => {
      try {
        const [info, custo] = await Promise.all([
          this.meta.obterInfoNumero({ phoneNumberId: c.phone_number_id, accessToken: c.access_token }),
          this.meta.obterCustoWaba({ wabaId: c.waba_id, accessToken: c.access_token }),
        ]);
        const custo_medio = custo.volume > 0 ? custo.custo / custo.volume : 0;
        return {
          canal_id: c.id, nome: c.nome,
          quality_rating: info.quality_rating || null,
          throughput_level: info.throughput?.level || null,
          account_status: info.status || null,
          display_phone_number: info.display_phone_number || null,
          moeda: custo.moeda, volume_30d: custo.volume, custo_30d: custo.custo, custo_medio,
          custo_30d_brl: custo.moeda === 'USD' && cotacao ? custo.custo * cotacao : null,
          cotacao_usd_brl: custo.moeda === 'USD' ? cotacao : null,
          erro: null,
        };
      } catch (e: any) {
        return {
          canal_id: c.id, nome: c.nome, quality_rating: null, throughput_level: null,
          account_status: null, display_phone_number: null,
          moeda: null, volume_30d: 0, custo_30d: 0, custo_medio: 0,
          custo_30d_brl: null, cotacao_usd_brl: null, erro: e.message,
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
