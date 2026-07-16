import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateLeadEtiquetaDto, AssignVendedorDto, UpdateLeadDto, FilterLeadsDto } from './dto/leads.dto';

interface ParsedLead {
  nome: string;
  telefone: string;
  cpf?: string;
}

const LEAD_INCLUDE = {
  etiqueta: { select: { id: true, nome: true, cor_hexadecimal: true, slug: true } },
  vendedor: { select: { id: true, nome: true } },
};

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

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
            etiqueta_id: etiquetaPadrao?.id || null,
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

    // Vendedor só vê seus próprios leads
    if (userRole === 'atendente' && userId) {
      where.vendedor_id = userId;
    }

    if (filters.etiqueta_id) where.etiqueta_id = filters.etiqueta_id;
    if (filters.search) {
      where.OR = [
        { nome: { contains: filters.search, mode: 'insensitive' } },
        { cpf: { contains: filters.search } },
        { telefone: { contains: filters.search } },
      ];
    }

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

  async markRead(tenantId: string, leadId: number) {
    const lead = await this.prisma.lead.findFirst({ where: { id_number: leadId, tenant_id: tenantId } });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    return this.prisma.lead.update({
      where: { id_number: leadId },
      data: { unread_count: 0 },
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
      this.prisma.lead.count({ where: { tenant_id: tenantId, ...(etAtendimento ? { etiqueta_id: etAtendimento.id } : {}) } }),
      this.prisma.message.count({ where: { tenant_id: tenantId } }),
    ]);

    return { total, disparados, emAtendimento, mensagens };
  }

  async updateEtiqueta(tenantId: string, leadId: number, dto: UpdateLeadEtiquetaDto, userId?: string, userRole?: string) {
    const where: any = { id_number: leadId, tenant_id: tenantId };
    if (userRole === 'atendente' && userId) where.vendedor_id = userId;

    const lead = await this.prisma.lead.findFirst({ where });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    return this.prisma.lead.update({
      where: { id_number: leadId },
      data: { etiqueta_id: dto.etiqueta_id },
      include: LEAD_INCLUDE,
    });
  }

  async assignVendedor(tenantId: string, leadId: number, dto: AssignVendedorDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id_number: leadId, tenant_id: tenantId } });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    return this.prisma.lead.update({
      where: { id_number: leadId },
      data: { vendedor_id: dto.vendedor_id },
      include: LEAD_INCLUDE,
    });
  }

  async update(tenantId: string, leadId: number, dto: UpdateLeadDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id_number: leadId, tenant_id: tenantId } });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.telefone !== undefined) data.telefone = this.normalizeTelefone(dto.telefone);
    if (dto.cpf !== undefined) data.cpf = dto.cpf.trim() ? dto.cpf.replace(/\D/g, '') : null;

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
      where: { tenant_id: tenantId, ativo: true, role: 'atendente' },
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
            etiqueta_id: etiquetaPadrao?.id || null,
          },
        });
        inserted++;
      } catch {
        skipped++;
      }
    }
    return { total: leads.length, inserted, skipped };
  }

  private normalizeTelefone(telefone: string): string {
    const digits = telefone.replace(/\D/g, '');
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
    if (digits.length === 10 || digits.length === 11) return '55' + digits;
    return digits;
  }
}
