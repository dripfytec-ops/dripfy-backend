import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { MessageDirection, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaService } from '../disparo-massa/meta.service';
import { telefoneVariantes } from '../../common/utils/telefone.util';
import { SetEtiquetasDto, AssignVendedorDto, UpdateLeadDto, FilterLeadsDto, StartConversationDto } from './dto/leads.dto';

interface ParsedLead {
  nome: string;
  telefone: string;
  cpf?: string;
}

const ETIQUETA_SELECT = { id: true, nome: true, cor_hexadecimal: true, slug: true };

const LEAD_INCLUDE = {
  etiquetas: { select: ETIQUETA_SELECT, orderBy: { ordem: 'asc' as const } },
  vendedor: { select: { id: true, nome: true } },
  canal: { select: { id: true, nome: true } },
};

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService, private meta: MetaService) {}

  async uploadExcel(tenantId: string, file: Express.Multer.File) {
    console.log('UPLOAD recebido | arquivo:', file?.originalname, '| mimetype:', file?.mimetype, '| tamanho:', file?.size);
    const isCsv = file.mimetype === 'text/csv' || file.originalname?.toLowerCase().endsWith('.csv');
    let rows: any[];
    if (isCsv) {
      const raw = file.buffer.toString('utf8');
      const content = (raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw).replace(/\r/g, '');
      const lines = content.split('\n').filter((l) => l.trim());
      const delimiter = lines[0]?.includes(';') ? ';' : ',';
      const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/['"]/g, ''));
      rows = lines.slice(1).map((line) => {
        const values = line.split(delimiter).map((v) => v.trim().replace(/['"]/g, ''));
        return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
      });
    } else {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<any>(sheet, { raw: false });
    }

    const leads: ParsedLead[] = rows
      .map((row) => {
        const get = (keys: string[]) => {
          for (const k of keys) {
            const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
            if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
          }
          return '';
        };
        return {
          nome: get(['nome', 'Nome', 'NOME', 'name']),
          telefone: get(['telefone', 'Telefone', 'TELEFONE', 'celular', 'Celular', 'phone', 'fone']),
          cpf: get(['cpf', 'CPF']) || undefined,
        };
      })
      .filter((l) => l.nome && l.telefone);

    // Busca a etiqueta padrão "balde_geral" do tenant
    const etiquetaPadrao = await this.prisma.etiqueta.findFirst({
      where: { tenant_id: tenantId, slug: 'disparados' },
    });

    let inserted = 0;
    let skipped = 0;

    for (const lead of leads) {
      try {
        await this.prisma.lead.create({
          data: {
            tenant_id: tenantId,
            nome: lead.nome,
            telefone: this.normalizeTelefone(lead.telefone),
            cpf: lead.cpf || null,
            etiquetas: etiquetaPadrao ? { connect: [{ id: etiquetaPadrao.id }] } : undefined,
          },
        });
        inserted++;
      } catch {
        skipped++;
      }
    }

    return { total: leads.length, inserted, skipped };
  }

  async findAll(tenantId: string, filters: FilterLeadsDto, userId?: string, userRole?: string) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { tenant_id: tenantId };
    const and: any[] = [];

    // Vendedor vê os leads já atribuídos a ele + os que ainda não têm
    // vendedor (balcão compartilhado) — só não vê os atribuídos a outro
    // vendedor, a menos que o tenant tenha ligado a chave
    // vendedor_ve_todos_atendimentos (aí vê a esteira toda, igual ao admin).
    if (userRole === 'atendente' && userId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { vendedor_ve_todos_atendimentos: true },
      });
      if (!tenant?.vendedor_ve_todos_atendimentos) {
        and.push({ OR: [{ vendedor_id: userId }, { vendedor_id: null }] });
      }
    }

    // Conversas encerradas saem da esteira geral (Minhas/Todas) e só
    // aparecem na aba "Encerradas".
    const mostrarEncerradas = String(filters.encerradas) === 'true';
    where.status_atual = mostrarEncerradas ? 'finalizado' : { not: 'finalizado' };

    // A base de contatos que o lojista sobe numa campanha vira Lead na hora
    // (pro Chat já reconhecer o número quando a mensagem chegar), mas não
    // deve poluir a esteira geral antes de pelo menos uma mensagem ter sido
    // enviada de verdade pra esse contato — nem toda campanha dispara pra
    // 100% da base de uma vez.
    where.disparado = true;

    if (filters.etiqueta_id) where.etiquetas = { some: { id: filters.etiqueta_id } };
    if (filters.origem_campanha_id) where.origem_campanha_id = filters.origem_campanha_id;
    if (filters.vendedor_id) where.vendedor_id = filters.vendedor_id;
    if (filters.search) {
      and.push({
        OR: [
          { nome: { contains: filters.search, mode: 'insensitive' } },
          { cpf: { contains: filters.search } },
          { telefone: { contains: filters.search } },
        ],
      });
    }

    if (and.length) where.AND = and;

    const orderBy =
      filters.sort === 'recent'
        ? [{ last_message_at: { sort: 'desc' as const, nulls: 'last' as const } }, { criado_em: 'desc' as const }]
        : { criado_em: 'desc' as const };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({ where, skip, take: limit, orderBy, include: LEAD_INCLUDE }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async markRead(tenantId: string, leadId: number, lida = true) {
    const lead = await this.prisma.lead.findFirst({ where: { id_number: leadId, tenant_id: tenantId } });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    return this.prisma.lead.update({
      where: { id_number: leadId },
      data: { unread_count: lida ? 0 : 1 },
      include: LEAD_INCLUDE,
    });
  }

  async getStats(tenantId: string) {
    const etAtendimento = await this.prisma.etiqueta.findFirst({
      where: { tenant_id: tenantId, slug: 'responderam' },
    });

    const [total, disparados, emAtendimento, mensagens] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { tenant_id: tenantId } }),
      this.prisma.lead.count({ where: { tenant_id: tenantId, disparado: true } }),
      this.prisma.lead.count({ where: { tenant_id: tenantId, ...(etAtendimento ? { etiquetas: { some: { id: etAtendimento.id } } } : {}) } }),
      this.prisma.message.count({ where: { tenant_id: tenantId } }),
    ]);

    return { total, disparados, emAtendimento, mensagens };
  }

  async setEtiquetas(tenantId: string, leadId: number, dto: SetEtiquetasDto, userId?: string, userRole?: string, userName?: string) {
    const where: any = { id_number: leadId, tenant_id: tenantId };
    if (userRole === 'atendente' && userId) where.OR = [{ vendedor_id: userId }, { vendedor_id: null }];

    const lead = await this.prisma.lead.findFirst({ where, include: { etiquetas: { select: { id: true } } } });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const idsAtuais = new Set(lead.etiquetas.map((e) => e.id));
    const idsAdicionados = dto.etiqueta_ids.filter((id) => !idsAtuais.has(id));

    const updated = await this.prisma.lead.update({
      where: { id_number: leadId },
      data: { etiquetas: { set: dto.etiqueta_ids.map((id) => ({ id })) } },
      include: LEAD_INCLUDE,
    });

    if (idsAdicionados.length && userName) {
      const novas = await this.prisma.etiqueta.findMany({ where: { id: { in: idsAdicionados } } });
      await this.prisma.leadActivity.createMany({
        data: novas.map((et) => ({
          tenant_id: tenantId,
          lead_id: leadId,
          texto: `${userName} adicionou a etiqueta "${et.nome}"`,
        })),
      });
    }

    return updated;
  }

  // Encerra a conversa: some da esteira geral (Minhas/Todas) e passa a
  // aparecer só na aba "Encerradas".
  async encerrar(tenantId: string, leadId: number, userName: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id_number: leadId, tenant_id: tenantId } });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const [updated] = await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id_number: leadId }, data: { status_atual: 'finalizado' }, include: LEAD_INCLUDE }),
      this.prisma.leadActivity.create({
        data: { tenant_id: tenantId, lead_id: leadId, texto: `${userName} encerrou esta conversa` },
      }),
    ]);
    return updated;
  }

  async assignToSelf(tenantId: string, leadId: number, userId: string, userName: string, userRole?: string) {
    const where: any = { id_number: leadId, tenant_id: tenantId };
    if (userRole === 'atendente') where.OR = [{ vendedor_id: userId }, { vendedor_id: null }];

    const lead = await this.prisma.lead.findFirst({ where });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const [updated] = await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id_number: leadId }, data: { vendedor_id: userId }, include: LEAD_INCLUDE }),
      this.prisma.leadActivity.create({
        data: { tenant_id: tenantId, lead_id: leadId, texto: `${userName} atribuiu a si mesmo essa conversa` },
      }),
    ]);
    return updated;
  }

  async assignVendedor(tenantId: string, leadId: number, dto: AssignVendedorDto, adminName?: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id_number: leadId, tenant_id: tenantId },
      include: { vendedor: { select: { nome: true } } },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const houveMudanca = dto.vendedor_id !== lead.vendedor_id;
    const novoVendedor = houveMudanca && dto.vendedor_id
      ? await this.prisma.user.findUnique({ where: { id: dto.vendedor_id }, select: { nome: true } })
      : null;

    let texto: string | null = null;
    if (houveMudanca && adminName) {
      if (!lead.vendedor_id) texto = `${adminName} atribuiu esta conversa a ${novoVendedor?.nome ?? 'um atendente'}`;
      else if (!dto.vendedor_id) texto = `${adminName} removeu ${lead.vendedor?.nome ?? 'o atendente'} desta conversa`;
      else texto = `${adminName} transferiu o atendimento de ${lead.vendedor?.nome ?? 'atendente anterior'} para ${novoVendedor?.nome ?? 'novo atendente'}`;
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id_number: leadId }, data: { vendedor_id: dto.vendedor_id }, include: LEAD_INCLUDE }),
      ...(texto ? [this.prisma.leadActivity.create({ data: { tenant_id: tenantId, lead_id: leadId, texto } })] : []),
    ]);
    return updated;
  }

  async getActivities(tenantId: string, leadId: number) {
    return this.prisma.leadActivity.findMany({
      where: { tenant_id: tenantId, lead_id: leadId },
      orderBy: { criado_em: 'asc' },
    });
  }

  async update(tenantId: string, leadId: number, dto: UpdateLeadDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id_number: leadId, tenant_id: tenantId } });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.telefone !== undefined) data.telefone = this.normalizeTelefone(dto.telefone);
    if (dto.cpf !== undefined) data.cpf = dto.cpf?.trim() ? dto.cpf.replace(/\D/g, '') : null;

    try {
      return await this.prisma.lead.update({
        where: { id_number: leadId },
        data,
        include: LEAD_INCLUDE,
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Já existe outro lead com esse CPF.');
      throw e;
    }
  }

  async listVendedores(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenant_id: tenantId, ativo: true },
      select: { id: true, nome: true, email: true },
      orderBy: { nome: 'asc' },
    });
  }

  async bulkInsert(tenantId: string, leads: ParsedLead[]) {
    const etiquetaPadrao = await this.prisma.etiqueta.findFirst({
      where: { tenant_id: tenantId, slug: 'disparados' },
    });
    let inserted = 0;
    let skipped = 0;
    for (const lead of leads) {
      if (!lead.nome || !lead.telefone) { skipped++; continue; }
      try {
        await this.prisma.lead.create({
          data: {
            tenant_id: tenantId,
            nome: lead.nome,
            telefone: this.normalizeTelefone(lead.telefone),
            cpf: lead.cpf || null,
            etiquetas: etiquetaPadrao ? { connect: [{ id: etiquetaPadrao.id }] } : undefined,
          },
        });
        inserted++;
      } catch {
        skipped++;
      }
    }
    return { total: leads.length, inserted, skipped };
  }

  // Cria (ou reaproveita) um lead pelo telefone e dispara um template pra
  // abrir a janela de 24h — é assim que se inicia conversa com um contato
  // novo, já que texto livre só funciona depois que o cliente responde.
  async startConversation(tenantId: string, dto: StartConversationDto) {
    const canal = await this.prisma.dmCanal.findFirst({
      where: { id: dto.canal_id, tenant_id: tenantId, ativo: true },
    });
    if (!canal) throw new NotFoundException('Canal não encontrado.');

    const telefone = this.normalizeTelefone(dto.telefone);

    let lead = await this.prisma.lead.findFirst({
      where: { tenant_id: tenantId, telefone: { in: telefoneVariantes(telefone) } },
    });
    if (!lead) {
      const etiquetaPadrao = await this.prisma.etiqueta.findFirst({
        where: { tenant_id: tenantId, slug: 'disparados' },
      });
      lead = await this.prisma.lead.create({
        data: {
          tenant_id: tenantId,
          nome: dto.nome,
          telefone,
          cpf: dto.cpf || null,
          canal_id: canal.id,
          etiquetas: etiquetaPadrao ? { connect: [{ id: etiquetaPadrao.id }] } : undefined,
        },
      });
    } else if (!lead.canal_id) {
      lead = await this.prisma.lead.update({ where: { id_number: lead.id_number }, data: { canal_id: canal.id } });
    }

    let resultado: any;
    try {
      resultado = await this.meta.enviarTemplate({
        phoneNumberId: canal.phone_number_id,
        accessToken: canal.access_token,
        telefone,
        templateName: dto.template_name,
        params: dto.template_params ?? [],
      });
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Erro ao enviar template.');
    }

    const wamid = resultado?.messages?.[0]?.id;

    await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          tenant_id: tenantId,
          canal_id: canal.id,
          lead_id: lead.id_number,
          wamid,
          direction: MessageDirection.saida,
          template_name: dto.template_name,
          status: MessageStatus.enviado,
        },
      }),
      this.prisma.lead.update({
        where: { id_number: lead.id_number },
        data: {
          disparado: true,
          last_message_at: new Date(),
          last_message_preview: `Template: ${dto.template_name}`,
        },
      }),
    ]);

    return this.prisma.lead.findUnique({ where: { id_number: lead.id_number }, include: LEAD_INCLUDE });
  }

  private normalizeTelefone(telefone: string): string {
    const digits = telefone.replace(/\D/g, '');
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
    if (digits.length === 10 || digits.length === 11) return '55' + digits;
    return digits;
  }
}
