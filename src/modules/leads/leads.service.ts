import { Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateLeadStatusDto, FilterLeadsDto } from './dto/leads.dto';
import { LeadStatus } from '@prisma/client';

interface ParsedLead {
  nome: string;
  telefone: string;
  cpf?: string;
}

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async uploadExcel(tenantId: string, file: Express.Multer.File, campanhaId?: string) {
    console.log('UPLOAD recebido | arquivo:', file?.originalname, '| mimetype:', file?.mimetype, '| tamanho:', file?.size, '| buffer?', !!file?.buffer);
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
      console.log('CSV detectado, delimitador:', delimiter, '| colunas:', headers);
    } else {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<any>(sheet, { raw: false });
      console.log('XLSX detectado | mimetype:', file.mimetype);
    }
    console.log('=== DEBUG UPLOAD ===');
    console.log('Total linhas:', rows.length);
    console.log('Linha 1 raw:', JSON.stringify(rows[0]));
    console.log('Chaves linha 1:', rows[0] ? Object.keys(rows[0]) : 'VAZIO');
    console.log('Char codes header:', rows[0] ? Object.keys(rows[0]).map(k => `${k}=[${[...k].map(c => c.charCodeAt(0))}]`) : '');

    const leads: ParsedLead[] = rows
      .map((row) => {
        const get = (keys: string[]) => {
          for (const k of keys) {
            const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()] ?? row[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()];
            if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
          }
          return '';
        };
        return {
          nome: get(['nome', 'Nome', 'NOME', 'name', 'Name']),
          telefone: get(['telefone', 'Telefone', 'TELEFONE', 'celular', 'Celular', 'CELULAR', 'phone', 'fone']),
          cpf: get(['cpf', 'CPF', 'Cpf']) || undefined,
        };
      })
      .filter((l) => l.nome && l.telefone);

    console.log('Leads após filtro:', leads.length, '| exemplo:', JSON.stringify(leads[0]));
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
            campanha_id: campanhaId || null,
          },
        });
        inserted++;
      } catch (e) {
        // CPF duplicado por tenant — pula
        skipped++;
      }
    }

    if (campanhaId) {
      await this.prisma.campanhaFila.update({
        where: { id: campanhaId },
        data: { total_leads: { increment: inserted } },
      });
    }

    return { total: leads.length, inserted, skipped };
  }

  async findAll(tenantId: string, filters: FilterLeadsDto) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { tenant_id: tenantId };

    if (filters.status) where.status_atual = filters.status;
    if (filters.search) {
      where.OR = [
        { nome: { contains: filters.search, mode: 'insensitive' } },
        { cpf: { contains: filters.search } },
        { telefone: { contains: filters.search } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({ where, skip, take: limit, orderBy: { criado_em: 'desc' } }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findKanban(tenantId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { tenant_id: tenantId },
      orderBy: { criado_em: 'asc' },
    });

    return {
      balde_geral: leads.filter((l) => l.status_atual === LeadStatus.balde_geral),
      aguardando_resposta: leads.filter((l) => l.status_atual === LeadStatus.aguardando_resposta),
      em_atendimento: leads.filter((l) => l.status_atual === LeadStatus.em_atendimento),
      finalizado: leads.filter((l) => l.status_atual === LeadStatus.finalizado),
    };
  }

  async getStats(tenantId: string) {
    const [total, disparados, aguardando, emAtendimento, finalizado, mensagens] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { tenant_id: tenantId } }),
      this.prisma.lead.count({ where: { tenant_id: tenantId, disparado: true } }),
      this.prisma.lead.count({ where: { tenant_id: tenantId, status_atual: LeadStatus.aguardando_resposta } }),
      this.prisma.lead.count({ where: { tenant_id: tenantId, status_atual: LeadStatus.em_atendimento } }),
      this.prisma.lead.count({ where: { tenant_id: tenantId, status_atual: LeadStatus.finalizado } }),
      this.prisma.message.count({ where: { tenant_id: tenantId } }),
    ]);

    return { total, disparados, aguardando, emAtendimento, finalizado, mensagens };
  }

  async updateStatus(tenantId: string, leadId: number, dto: UpdateLeadStatusDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id_number: leadId, tenant_id: tenantId },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    return this.prisma.lead.update({
      where: { id_number: leadId },
      data: { status_atual: dto.status_atual },
    });
  }

  async bulkInsert(tenantId: string, leads: ParsedLead[], campanhaId?: string) {
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
            campanha_id: campanhaId || null,
          },
        });
        inserted++;
      } catch {
        skipped++;
      }
    }
    if (campanhaId && inserted > 0) {
      await this.prisma.campanhaFila.update({
        where: { id: campanhaId },
        data: { total_leads: { increment: inserted } },
      });
    }
    return { total: leads.length, inserted, skipped };
  }

  private normalizeTelefone(telefone: string): string {
    const digits = telefone.replace(/\D/g, '');
    // Já tem código do país 55 e tamanho correto (12 ou 13 dígitos)
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      return digits;
    }
    // 10 dígitos (DDD + 8) ou 11 dígitos (DDD + 9) → adiciona 55
    if (digits.length === 10 || digits.length === 11) {
      return '55' + digits;
    }
    return digits;
  }
}
