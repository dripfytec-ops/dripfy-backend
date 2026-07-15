import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaService } from './meta.service';
import { CreateDmCampanhaDto, PatchDmCampanhaDto } from './dto/dm-campanha.dto';
import { DmContato, DmCanal } from '@prisma/client';

const TAMANHO_LOTE_PADRAO = 10;
const DELAY_MS_PADRAO = 300;

@Injectable()
export class DmCampanhasService implements OnModuleInit {
  private readonly logger = new Logger(DmCampanhasService.name);
  private loopsAtivos = new Set<string>();

  constructor(private prisma: PrismaService, private meta: MetaService) {}

  async onModuleInit() {
    this.resumirCampanhasAtivas().catch((e) => this.logger.error(`resumirCampanhasAtivas: ${e.message}`));
    setInterval(() => {
      this.resumirCampanhasAtivas().catch((e) => this.logger.error(`resumirCampanhasAtivas: ${e.message}`));
    }, 60_000);
  }

  async findAll(tenantId: string) {
    return this.prisma.dmCampanha.findMany({
      where: { tenant_id: tenantId },
      orderBy: { criado_em: 'desc' },
      include: { canal: { select: { id: true, nome: true } } },
    });
  }

  async getOne(tenantId: string, id: string) {
    const campanha = await this.prisma.dmCampanha.findFirst({
      where: { id, tenant_id: tenantId },
      include: { canal: { select: { id: true, nome: true } } },
    });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');
    const contatos = await this.prisma.dmContato.findMany({ where: { campanha_id: id }, orderBy: { criado_em: 'asc' } });
    return { ...campanha, contatos };
  }

  async create(tenantId: string, dto: CreateDmCampanhaDto) {
    const canal = await this.prisma.dmCanal.findFirst({ where: { id: dto.canal_id, tenant_id: tenantId } });
    if (!canal) throw new BadRequestException('Canal não encontrado.');

    const campanha = await this.prisma.dmCampanha.create({
      data: {
        tenant_id: tenantId,
        canal_id: dto.canal_id,
        nome: dto.nome,
        template_name: dto.template_name,
        template_params: dto.template_params ?? [],
        header_image_url: dto.header_image_url || null,
        status: dto.agendado_para ? 'agendada' : 'rascunho',
        agendado_para: dto.agendado_para ? new Date(dto.agendado_para) : null,
        total_contatos: dto.contatos.length,
      },
    });

    if (dto.contatos.length > 0) {
      await this.prisma.dmContato.createMany({
        data: dto.contatos.map((c) => ({ campanha_id: campanha.id, nome: c.nome || null, telefone: c.telefone })),
      });
    }

    return campanha;
  }

  async patch(tenantId: string, id: string, dto: PatchDmCampanhaDto) {
    const campanha = await this.prisma.dmCampanha.findFirst({ where: { id, tenant_id: tenantId } });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');
    return this.prisma.dmCampanha.update({ where: { id }, data: dto });
  }

  async iniciarDisparo(tenantId: string, campanhaId: string) {
    const campanha = await this.prisma.dmCampanha.findFirst({ where: { id: campanhaId, tenant_id: tenantId } });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');
    if (this.loopsAtivos.has(campanhaId)) return { started: false };
    if (!campanha.canal_id) throw new BadRequestException('Campanha sem canal definido.');
    const canal = await this.prisma.dmCanal.findUnique({ where: { id: campanha.canal_id } });
    if (!canal) throw new BadRequestException('Canal da campanha não encontrado.');

    this.loopsAtivos.add(campanhaId);
    this.runLoop(campanhaId, canal).catch((e) => this.logger.error(`Erro na campanha ${campanhaId}: ${e.message}`));
    return { started: true };
  }

  // Rede de segurança: retoma campanhas 'em_andamento' sem loop ativo neste
  // processo (ex: servidor reiniciou no meio de um disparo). Chamada no boot
  // e a cada minuto.
  async resumirCampanhasAtivas() {
    const ativas = await this.prisma.dmCampanha.findMany({ where: { status: 'em_andamento' } });
    for (const campanha of ativas) {
      if (this.loopsAtivos.has(campanha.id) || !campanha.canal_id) continue;
      const canal = await this.prisma.dmCanal.findUnique({ where: { id: campanha.canal_id } });
      if (!canal) continue;
      this.loopsAtivos.add(campanha.id);
      this.logger.log(`Retomando campanha ${campanha.id} após reinício`);
      this.runLoop(campanha.id, canal).catch((e) => this.logger.error(e.message));
    }
  }

  private async runLoop(campanhaId: string, canal: DmCanal) {
    try {
      const loteSize = canal.lote_size || TAMANHO_LOTE_PADRAO;
      const delayMs = canal.delay_ms || DELAY_MS_PADRAO;

      const antes = await this.prisma.dmCampanha.findUniqueOrThrow({ where: { id: campanhaId } });
      const campanha = await this.prisma.dmCampanha.update({
        where: { id: campanhaId },
        data: { status: 'em_andamento', iniciado_em: antes.iniciado_em ?? new Date() },
      });

      while (true) {
        const atual = await this.prisma.dmCampanha.findUnique({ where: { id: campanhaId }, select: { status: true } });
        if (!atual || atual.status === 'pausada') break;
        const lote = await this.reivindicarLotePendente(campanhaId, loteSize);
        if (lote.length === 0) break;
        await this.enviarLote(campanhaId, lote, campanha, canal);
        await this.sleep(delayMs);
      }

      const restantes = await this.prisma.dmContato.count({ where: { campanha_id: campanhaId, status: 'pendente' } });
      if (restantes === 0) {
        await this.prisma.dmCampanha.update({ where: { id: campanhaId }, data: { status: 'concluida' } }).catch(() => {});
        this.logger.log(`Campanha ${campanhaId} concluída.`);
      }
    } finally {
      this.loopsAtivos.delete(campanhaId);
    }
  }

  // Reivindica um lote de pendentes com compare-and-swap: só um processo
  // consegue mudar o status de 'pendente' pra 'enviando' por contato, mesmo
  // que dois loops rodem ao mesmo tempo (ex: pausa/retomada rápida).
  private async reivindicarLotePendente(campanhaId: string, loteSize: number): Promise<DmContato[]> {
    const candidatos = await this.prisma.dmContato.findMany({
      where: { campanha_id: campanhaId, status: 'pendente' },
      orderBy: { criado_em: 'asc' },
      take: loteSize,
    });
    const reivindicados: DmContato[] = [];
    for (const candidato of candidatos) {
      const { count } = await this.prisma.dmContato.updateMany({
        where: { id: candidato.id, status: 'pendente' },
        data: { status: 'enviando' },
      });
      if (count > 0) reivindicados.push(candidato);
    }
    return reivindicados;
  }

  private primeiroNome(nomeCompleto: string) {
    return nomeCompleto.trim().split(/\s+/)[0];
  }

  private async enviarUm(contato: DmContato, campanha: { template_name: string; template_params: any; header_image_url: string | null }, canal: DmCanal) {
    const templateParams: string[] = Array.isArray(campanha.template_params) ? campanha.template_params : [];
    const params = contato.nome ? [this.primeiroNome(contato.nome), ...templateParams] : templateParams;
    const resultado = await this.meta.enviarTemplate({
      phoneNumberId: canal.phone_number_id, accessToken: canal.access_token,
      telefone: contato.telefone, templateName: campanha.template_name, params,
      headerImageUrl: campanha.header_image_url || undefined,
    });
    return resultado?.messages?.[0]?.id || null;
  }

  private async enviarLote(campanhaId: string, contatos: DmContato[], campanha: any, canal: DmCanal) {
    const resultados = await Promise.allSettled(contatos.map((contato) => this.enviarUm(contato, campanha, canal)));
    let enviados = 0;
    let falhas = 0;
    await Promise.all(resultados.map(async (resultado, i) => {
      const contato = contatos[i];
      if (resultado.status === 'fulfilled') {
        enviados++;
        await this.prisma.dmContato.update({
          where: { id: contato.id },
          data: { status: 'enviado', enviado_em: new Date(), message_id: resultado.value },
        });
      } else {
        falhas++;
        await this.prisma.dmContato.update({
          where: { id: contato.id },
          data: { status: 'falha', erro: String(resultado.reason?.message || resultado.reason) },
        });
      }
    }));
    await this.prisma.dmCampanha.update({
      where: { id: campanhaId },
      data: { enviados: { increment: enviados }, falhas: { increment: falhas } },
    });
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
