import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FinanceiroService } from '../financeiro/financeiro.service';
import { OdysseiaClientService } from '../odysseia/odysseia-client.service';
import { ConfigurarOdysseiaDto } from './dto/configurar-odysseia.dto';

// Formata um Date em "data + horário" no fuso de Brasília, do jeito que a
// Odysseia espera (scheduled_date YYYY-MM-DD, scheduled_slot HH:MM) — o
// servidor roda em UTC, então não dá pra usar toISOString() direto sem
// deslocar o horário que o Master efetivamente escolheu.
function paraDataHoraBrasil(data: Date): { scheduled_date: string; scheduled_slot: string } {
  const scheduled_date = data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const scheduled_slot = data.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return { scheduled_date, scheduled_slot };
}

@Injectable()
export class AdminCampanhasJmdService implements OnModuleInit {
  private readonly logger = new Logger(AdminCampanhasJmdService.name);

  constructor(
    private prisma: PrismaService,
    private financeiro: FinanceiroService,
    private odysseia: OdysseiaClientService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.sincronizarStatusOdysseia().catch((e) => this.logger.error(`sincronizarStatusOdysseia: ${e.message}`));
    }, 60_000);
  }

  async findAll() {
    return this.prisma.dmCampanha.findMany({
      where: { tipo: 'dripfy' },
      orderBy: { criado_em: 'desc' },
      include: {
        tenant: { select: { id: true, nome_empresa: true, slug: true } },
        canal: { select: { id: true, nome: true } },
      },
    });
  }

  async aprovar(id: string, aprovadoPor: string) {
    const campanha = await this.prisma.dmCampanha.findUnique({ where: { id }, include: { tenant: true } });
    if (!campanha) throw new NotFoundException('Demanda não encontrada.');
    if (campanha.tipo !== 'dripfy') throw new BadRequestException('Essa campanha não é uma demanda Dripfy.');
    if (campanha.financeiro_status === 'pago') return campanha;

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.dmCampanha.update({
        where: { id },
        data: {
          financeiro_status: 'pago',
          status: campanha.status === 'aguardando_pagamento' ? 'agendada' : campanha.status,
          aprovado_em: new Date(),
          aprovado_por: aprovadoPor,
        },
      });

      // Pagamento manual (PIX estático + comprovante) cobre exatamente os
      // créditos desta demanda — registra a entrada e a saída no extrato pra
      // ficar transparente pro parceiro, mesmo sem mexer no saldo líquido.
      const totalContatos = campanha.total_contatos;
      const saldoAtual = campanha.tenant.creditos_saldo;
      await this.financeiro.registrarTransacao(tx, {
        tenantId: campanha.tenant_id,
        tipo: 'compra',
        quantidade: totalContatos,
        saldoApos: saldoAtual + totalContatos,
        descricao: `Pagamento confirmado (PIX manual) — demanda "${campanha.nome}"`,
        campanhaId: campanha.id,
      });
      await this.financeiro.registrarTransacao(tx, {
        tenantId: campanha.tenant_id,
        tipo: 'consumo',
        quantidade: -totalContatos,
        saldoApos: saldoAtual,
        descricao: `Consumo — demanda "${campanha.nome}" (${totalContatos} contatos)`,
        campanhaId: campanha.id,
      });

      return atualizada;
    });
  }

  async exportarContatosCsv(id: string) {
    const campanha = await this.prisma.dmCampanha.findUnique({ where: { id }, include: { tenant: true } });
    if (!campanha) throw new NotFoundException('Demanda não encontrada.');

    const contatos = await this.prisma.dmContato.findMany({ where: { campanha_id: id }, orderBy: { criado_em: 'asc' } });

    // Formato provisório (nome, telefone, cpf, mensagem, link, mídia) — ajustar
    // pro padrão exato exigido pela execução manual assim que confirmado.
    const linhas = [
      ['nome', 'telefone', 'cpf', 'mensagem', 'link_botao', 'midia_tipo', 'midia_url'].join(';'),
      ...contatos.map((c) => [
        c.nome || '',
        c.telefone,
        c.cpf || '',
        (campanha.mensagem_texto || '').replace(/;/g, ',').replace(/\n/g, ' '),
        campanha.link_botao || '',
        campanha.midia_tipo || '',
        campanha.midia_url || '',
      ].join(';')),
    ];

    return {
      filename: `dripfy_${campanha.tenant.slug}_${campanha.nome.replace(/\s+/g, '_')}.csv`,
      csv: linhas.join('\n'),
    };
  }

  // [Master] Lista os templates de WhatsApp já cadastrados no painel da
  // Odysseia — usado pra popular o seletor ao configurar uma demanda.
  async listarTemplatesOdysseia() {
    return this.odysseia.listarTemplatesWhatsapp();
  }

  // [Master] Define que essa demanda será executada via Odysseia (WhatsApp
  // agendado) em vez de exportação manual de CSV — não dispara ainda, só
  // grava a configuração pra revisão antes de confirmar.
  async configurarOdysseia(id: string, dto: ConfigurarOdysseiaDto) {
    const campanha = await this.prisma.dmCampanha.findUnique({ where: { id } });
    if (!campanha) throw new NotFoundException('Demanda não encontrada.');
    if (campanha.tipo !== 'dripfy') throw new BadRequestException('Essa campanha não é uma demanda Dripfy.');
    if (campanha.odysseia_job_id) throw new BadRequestException('Essa demanda já foi disparada via Odysseia — não é possível reconfigurar.');

    const agendadoPara = dto.agendado_para ? new Date(dto.agendado_para) : campanha.agendado_para;
    if (!agendadoPara) throw new BadRequestException('Informe data e horário do agendamento (a Odysseia exige um horário de envio).');

    return this.prisma.dmCampanha.update({
      where: { id },
      data: {
        execucao: 'odysseia_whatsapp',
        odysseia_template_id: dto.template_id,
        odysseia_receptive_fonte: dto.receptive_fonte,
        agendado_para: agendadoPara,
      },
    });
  }

  // [Master] Dispara de fato a demanda via API da Odysseia — substitui o
  // passo manual de "exportar CSV + enviar por fora do sistema".
  async dispararViaOdysseia(id: string) {
    const campanha = await this.prisma.dmCampanha.findUnique({ where: { id } });
    if (!campanha) throw new NotFoundException('Demanda não encontrada.');
    if (campanha.tipo !== 'dripfy') throw new BadRequestException('Essa campanha não é uma demanda Dripfy.');
    if (campanha.execucao !== 'odysseia_whatsapp') throw new BadRequestException('Configure a demanda pra execução via Odysseia antes de disparar.');
    if (campanha.financeiro_status !== 'pago') throw new BadRequestException('Confirme o pagamento da demanda antes de disparar.');
    if (campanha.odysseia_job_id) throw new BadRequestException('Essa demanda já foi disparada via Odysseia.');
    if (!campanha.odysseia_template_id || !campanha.odysseia_receptive_fonte || !campanha.agendado_para) {
      throw new BadRequestException('Demanda sem template/fonte de resposta/agendamento configurados.');
    }

    const contatos = await this.prisma.dmContato.findMany({ where: { campanha_id: id } });
    if (contatos.length === 0) throw new BadRequestException('Demanda sem contatos.');

    const { scheduled_date, scheduled_slot } = paraDataHoraBrasil(campanha.agendado_para);

    const resultado = await this.odysseia.criarDisparoWhatsapp({
      scheduled_date,
      scheduled_slot,
      template_id: campanha.odysseia_template_id,
      receptive_fonte: campanha.odysseia_receptive_fonte,
      idempotency_key: campanha.id,
      contatos: contatos.map((c) => ({ telefone: c.telefone, nome: c.nome || undefined, cpf: c.cpf || undefined })),
    });

    return this.prisma.dmCampanha.update({
      where: { id },
      data: {
        odysseia_job_id: resultado.id,
        odysseia_status: resultado.status,
        status: 'agendada',
      },
    });
  }

  // Roda a cada minuto: espelha o status real do disparo na Odysseia pras
  // demandas já enviadas, até sair de 'aguardando' (enviado/cancelado).
  private async sincronizarStatusOdysseia() {
    const pendentes = await this.prisma.dmCampanha.findMany({
      where: { tipo: 'dripfy', execucao: 'odysseia_whatsapp', odysseia_job_id: { not: null }, odysseia_status: 'aguardando' },
    });

    for (const campanha of pendentes) {
      try {
        const resultado = await this.odysseia.consultarDisparoWhatsapp(campanha.odysseia_job_id!);
        if (resultado.status === campanha.odysseia_status) continue;

        await this.prisma.dmCampanha.update({
          where: { id: campanha.id },
          data: {
            odysseia_status: resultado.status,
            ...(resultado.status === 'enviado' ? { status: 'concluida' } : {}),
          },
        });
        this.logger.log(`Demanda ${campanha.id}: status Odysseia atualizado pra "${resultado.status}".`);
      } catch (e: any) {
        this.logger.error(`Falha ao sincronizar status Odysseia da demanda ${campanha.id}: ${e.message}`);
      }
    }
  }
}
