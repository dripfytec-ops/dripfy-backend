import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaService } from './meta.service';
import { FinanceiroService } from '../financeiro/financeiro.service';
import { CreateDmCampanhaDto, PatchDmCampanhaDto, CreateDripifyCampanhaDto } from './dto/dm-campanha.dto';
import { telefoneVariantes } from '../../common/utils/telefone.util';
import { DmContato, DmCanal, MessageDirection, MessageStatus, LeadStatus } from '@prisma/client';

const TAMANHO_LOTE_PADRAO = 10;
const DELAY_MS_PADRAO = 300;

@Injectable()
export class DmCampanhasService implements OnModuleInit {
  private readonly logger = new Logger(DmCampanhasService.name);
  private loopsAtivos = new Set<string>();

  constructor(private prisma: PrismaService, private meta: MetaService, private financeiro: FinanceiroService) {}

  async onModuleInit() {
    this.resumirCampanhasAtivas().catch((e) => this.logger.error(`resumirCampanhasAtivas: ${e.message}`));
    setInterval(() => {
      this.resumirCampanhasAtivas().catch((e) => this.logger.error(`resumirCampanhasAtivas: ${e.message}`));
    }, 60_000);
  }

  // Só campanhas de Disparo Próprio — as de Disparo Dripfy (tipo='dripfy')
  // vivem só no painel do Master (/admin/demandas-dripfy), não nesta lista.
  async findAll(tenantId: string) {
    return this.prisma.dmCampanha.findMany({
      where: { tenant_id: tenantId, tipo: 'proprio' },
      orderBy: { criado_em: 'desc' },
      include: { canal: { select: { id: true, nome: true } }, vendedor: { select: { id: true, nome: true } } },
    });
  }

  async findAllDripify(tenantId: string) {
    return this.prisma.dmCampanha.findMany({
      where: { tenant_id: tenantId, tipo: 'dripfy' },
      orderBy: { criado_em: 'desc' },
      include: { canal: { select: { id: true, nome: true } } },
    });
  }

  async getOne(tenantId: string, id: string) {
    const campanha = await this.prisma.dmCampanha.findFirst({
      where: { id, tenant_id: tenantId },
      include: { canal: { select: { id: true, nome: true } }, vendedor: { select: { id: true, nome: true } } },
    });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');
    const contatos = await this.prisma.dmContato.findMany({ where: { campanha_id: id }, orderBy: { criado_em: 'asc' } });
    return { ...campanha, contatos };
  }

  async create(tenantId: string, dto: CreateDmCampanhaDto) {
    const canal = await this.prisma.dmCanal.findFirst({ where: { id: dto.canal_id, tenant_id: tenantId } });
    if (!canal) throw new BadRequestException('Canal não encontrado.');

    if (dto.vendedor_id) {
      const vendedor = await this.prisma.user.findFirst({
        where: { id: dto.vendedor_id, tenant_id: tenantId },
      });
      if (!vendedor) throw new BadRequestException('Vendedor não encontrado.');
    }

    const campanha = await this.prisma.dmCampanha.create({
      data: {
        tenant_id: tenantId,
        canal_id: dto.canal_id,
        vendedor_id: dto.vendedor_id || null,
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
        data: dto.contatos.map((c) => ({
          campanha_id: campanha.id,
          nome: c.nome || null,
          cpf: c.cpf ? c.cpf.replace(/\D/g, '') || null : null,
          telefone: this.normalizeTelefone(c.telefone),
        })),
      });

      // Persiste o Lead (nome + CPF) já na importação, não só quando a mensagem
      // é efetivamente enviada — assim o Chat já reconhece o contato (nome/CPF
      // preenchidos) mesmo antes do disparo rodar (ex: campanha agendada, ou
      // parada aguardando recarga de créditos).
      await this.persistirLeadsEmLote(tenantId, dto.contatos, campanha);
    }

    return campanha;
  }

  // Cria uma "demanda" de Disparo Dripfy: não passa pelo loop de envio da
  // Meta (execução é manual pela equipe Dripfy, depois que o Master libera no
  // painel /admin/demandas-dripfy) — mas os Leads já ficam prontos no Chat
  // desde já, igual ao Disparo Próprio.
  async createDripify(tenantId: string, dto: CreateDripifyCampanhaDto) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const totalContatos = dto.contatos.length;
    // Assume 1 crédito = 1 contato/mensagem — não existe hoje uma taxa de
    // conversão diferente definida em nenhum outro lugar do sistema.
    const saldoSuficiente = tenant.creditos_saldo >= totalContatos;

    if (dto.canal_id) {
      const canal = await this.prisma.dmCanal.findFirst({ where: { id: dto.canal_id, tenant_id: tenantId } });
      if (!canal) throw new BadRequestException('Canal não encontrado.');
    }

    const campanha = await this.prisma.$transaction(async (tx) => {
      const nova = await tx.dmCampanha.create({
        data: {
          tenant_id: tenantId,
          canal_id: dto.canal_id || null,
          nome: dto.nome,
          tipo: 'dripfy',
          prioridade: dto.prioridade || 'media',
          mensagem_texto: dto.mensagem_texto,
          link_botao: dto.link_botao || null,
          foto_perfil_url: dto.foto_perfil_url || null,
          midia_tipo: dto.midia_tipo || 'nenhuma',
          midia_url: dto.midia_url || null,
          agendado_para: dto.agendado_para ? new Date(dto.agendado_para) : null,
          total_contatos: totalContatos,
          status: saldoSuficiente ? 'agendada' : 'aguardando_pagamento',
          financeiro_status: saldoSuficiente ? 'pago' : 'pendente',
        },
      });

      if (saldoSuficiente) {
        const tenantAtualizado = await tx.tenant.update({ where: { id: tenantId }, data: { creditos_saldo: { decrement: totalContatos } } });
        await this.financeiro.registrarTransacao(tx, {
          tenantId,
          tipo: 'consumo',
          quantidade: -totalContatos,
          saldoApos: tenantAtualizado.creditos_saldo,
          descricao: `Consumo — demanda "${dto.nome}" (${totalContatos} contatos)`,
          campanhaId: nova.id,
        });
      }

      if (dto.salvar_como_modelo && dto.nome_modelo) {
        await tx.dmModeloMensagem.create({
          data: { tenant_id: tenantId, nome: dto.nome_modelo, texto: dto.mensagem_nucleo || dto.mensagem_texto, link_botao: dto.link_botao || null },
        });
      }

      return nova;
    });

    await this.prisma.dmContato.createMany({
      data: dto.contatos.map((c) => ({
        campanha_id: campanha.id,
        nome: c.nome || null,
        cpf: c.cpf ? c.cpf.replace(/\D/g, '') || null : null,
        telefone: this.normalizeTelefone(c.telefone),
      })),
    });

    await this.persistirLeadsEmLote(tenantId, dto.contatos, campanha);

    return campanha;
  }

  async listModelos(tenantId: string) {
    return this.prisma.dmModeloMensagem.findMany({ where: { tenant_id: tenantId }, orderBy: { criado_em: 'desc' } });
  }

  // Upsert em lote dos Leads a partir de uma lista de contatos crus (CSV),
  // com concorrência limitada pra não travar a resposta em listas grandes.
  private async persistirLeadsEmLote(
    tenantId: string,
    contatosCsv: { nome?: string; cpf?: string; telefone: string }[],
    campanha: { id: string; nome: string; vendedor_id?: string | null; canal_id: string | null },
  ) {
    const contatosNormalizados = contatosCsv.map((c) => ({
      nome: c.nome || null,
      cpf: c.cpf ? c.cpf.replace(/\D/g, '') || null : null,
      telefone: this.normalizeTelefone(c.telefone),
    }));
    const LOTE_UPSERT = 20;
    for (let i = 0; i < contatosNormalizados.length; i += LOTE_UPSERT) {
      const lote = contatosNormalizados.slice(i, i + LOTE_UPSERT);
      await Promise.allSettled(
        lote.map((c) =>
          this.garantirLead(tenantId, c, { id: campanha.id, nome: campanha.nome, vendedor_id: campanha.vendedor_id ?? null, canal_id: campanha.canal_id })
            .catch((e) => this.logger.error(`Falha ao persistir lead do contato ${c.telefone}: ${e.message}`)),
        ),
      );
    }
  }

  // Garante que existe um Lead pro contato (nome + CPF + origem da campanha),
  // sem mexer em campos de envio (last_message_*, disparado) — isso fica a
  // cargo de sincronizarLead, chamado só quando a mensagem é de fato enviada.
  private async garantirLead(
    tenantId: string,
    contato: { nome: string | null; cpf: string | null; telefone: string },
    campanha: { id: string; nome: string; vendedor_id: string | null; canal_id: string | null },
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { tenant_id: tenantId, telefone: { in: telefoneVariantes(contato.telefone) }, canal_id: campanha.canal_id },
    });

    if (!lead) {
      await this.prisma.lead.create({
        data: {
          tenant_id: tenantId,
          nome: contato.nome || `Contato ${contato.telefone}`,
          telefone: contato.telefone,
          cpf: contato.cpf || null,
          canal_id: campanha.canal_id,
          origem_campanha_id: campanha.id,
          origem_campanha_nome: campanha.nome,
          vendedor_id: campanha.vendedor_id,
        },
      }).catch(async (e) => {
        // Corrida/duplicidade: CPF já usado por outro lead do tenant nesse
        // mesmo canal. Segue sem CPF em vez de derrubar a importação do contato.
        if (contato.cpf) {
          return this.prisma.lead.create({
            data: {
              tenant_id: tenantId,
              nome: contato.nome || `Contato ${contato.telefone}`,
              telefone: contato.telefone,
              canal_id: campanha.canal_id,
              origem_campanha_id: campanha.id,
              origem_campanha_nome: campanha.nome,
              vendedor_id: campanha.vendedor_id,
            },
          });
        }
        throw e;
      });
      return;
    }

    await this.prisma.lead.update({
      where: { id_number: lead.id_number },
      data: {
        nome: contato.nome || lead.nome,
        cpf: lead.cpf ?? contato.cpf ?? undefined,
        // Carimbo de origem é fixo: só grava se o lead ainda não tinha uma
        // campanha de origem (ex: foi criado antes por resposta espontânea).
        ...(lead.origem_campanha_id ? {} : { origem_campanha_id: campanha.id, origem_campanha_nome: campanha.nome }),
        // Só atribui o vendedor exclusivo da campanha se o lead ainda não
        // tinha vendedor — não sobrescreve uma atribuição manual existente.
        ...(lead.vendedor_id || !campanha.vendedor_id ? {} : { vendedor_id: campanha.vendedor_id }),
      },
    }).catch(() => {});
  }

  async patch(tenantId: string, id: string, dto: PatchDmCampanhaDto) {
    const campanha = await this.prisma.dmCampanha.findFirst({ where: { id, tenant_id: tenantId } });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');
    return this.prisma.dmCampanha.update({ where: { id }, data: dto });
  }

  // Exclui a campanha/demanda, sua base de contatos (DmContato tem
  // onDelete: Cascade) e também os Leads que essa campanha gerou no Chat —
  // junto vão as mensagens e atividades deles (Message/LeadActivity têm
  // onDelete: Cascade a partir do Lead).
  async remove(tenantId: string, id: string) {
    const campanha = await this.prisma.dmCampanha.findFirst({ where: { id, tenant_id: tenantId } });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');
    if (campanha.status === 'em_andamento') {
      throw new BadRequestException('Pause a campanha antes de excluí-la.');
    }
    if (campanha.financeiro_status === 'pago') {
      throw new BadRequestException('Não é possível excluir uma demanda com pagamento já confirmado.');
    }

    this.loopsAtivos.delete(id);
    await this.prisma.$transaction([
      this.prisma.lead.deleteMany({ where: { tenant_id: tenantId, origem_campanha_id: id } }),
      this.prisma.dmCampanha.delete({ where: { id } }),
    ]);
    return { deleted: true };
  }

  // Exporta os contatos com falha de uma campanha em CSV (separado por
  // vírgula, mesmo cabeçalho aceito no upload de nova campanha) — dá pra
  // reimportar direto numa campanha nova pra tentar o disparo de novo.
  async exportarFalhasCsv(tenantId: string, id: string) {
    const campanha = await this.prisma.dmCampanha.findFirst({ where: { id, tenant_id: tenantId } });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');

    const contatos = await this.prisma.dmContato.findMany({
      where: { campanha_id: id, status: 'falha' },
      orderBy: { criado_em: 'asc' },
    });

    const csvField = (valor: string) => {
      const v = valor ?? '';
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };

    const linhas = [
      ['nome', 'telefone', 'cpf', 'erro'].join(','),
      ...contatos.map((c) => [
        csvField(c.nome || ''),
        csvField(c.telefone),
        csvField(c.cpf || ''),
        csvField(c.erro || ''),
      ].join(',')),
    ];

    return {
      filename: `falhas_${campanha.nome.replace(/\s+/g, '_')}.csv`,
      csv: linhas.join('\n'),
      total: contatos.length,
    };
  }

  async iniciarDisparo(tenantId: string, campanhaId: string) {
    const campanha = await this.prisma.dmCampanha.findFirst({ where: { id: campanhaId, tenant_id: tenantId } });
    if (!campanha) throw new NotFoundException('Campanha não encontrada.');
    if (campanha.tipo === 'dripfy') {
      throw new BadRequestException('Demandas de Disparo Dripfy são executadas manualmente pela equipe Dripfy, não pelo disparo automático.');
    }
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
        // Gera/atualiza o lead e a mensagem no Chat assim que o disparo dá certo,
        // pra não depender do cliente responder primeiro pra existir a conversa.
        await this.sincronizarLead(campanha.tenant_id, contato, campanha, resultado.value)
          .catch((e) => this.logger.error(`Falha ao sincronizar lead do contato ${contato.id}: ${e.message}`));
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

  // Ponte entre o Disparo em Massa e o Chat: quando uma mensagem de campanha
  // é enviada com sucesso, marca o lead como disparado e registra a mensagem
  // no histórico. O Lead em si (nome/CPF/origem) já foi garantido antes, na
  // importação (ver garantirLead, chamado em create()) — aqui é só o
  // carimbo de envio + o registro da mensagem enviada.
  private async sincronizarLead(
    tenantId: string,
    contato: DmContato,
    campanha: { id: string; nome: string; template_name: string; vendedor_id: string | null; canal_id: string | null },
    wamid: string | null,
  ) {
    const preview = `Template: ${campanha.template_name}`;
    await this.garantirLead(tenantId, { nome: contato.nome, cpf: contato.cpf, telefone: contato.telefone }, campanha);

    const lead = await this.prisma.lead.findFirst({
      where: { tenant_id: tenantId, telefone: { in: telefoneVariantes(contato.telefone) }, canal_id: campanha.canal_id },
    });
    if (!lead) {
      this.logger.error(`Lead não encontrado após garantirLead para o contato ${contato.telefone} — pulando registro da mensagem.`);
      return;
    }

    await this.prisma.lead.update({
      where: { id_number: lead.id_number },
      data: {
        disparado: true,
        status_atual: LeadStatus.aguardando_resposta,
        last_message_at: new Date(),
        last_message_preview: preview,
      },
    }).catch(() => {});

    await this.prisma.message.create({
      data: {
        tenant_id: tenantId,
        canal_id: campanha.canal_id,
        lead_id: lead.id_number,
        wamid: wamid || undefined,
        template_name: campanha.template_name,
        direction: MessageDirection.saida,
        status: MessageStatus.enviado,
      },
    }).catch((e) => this.logger.error(`Falha ao registrar mensagem do lead ${lead!.id_number}: ${e.message}`));
  }

  private normalizeTelefone(telefone: string): string {
    const digits = telefone.replace(/\D/g, '');
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
    if (digits.length === 10 || digits.length === 11) return '55' + digits;
    return digits;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
