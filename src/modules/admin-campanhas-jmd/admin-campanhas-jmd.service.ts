import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminCampanhasJmdService {
  constructor(private prisma: PrismaService) {}

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

    const [atualizada] = await this.prisma.$transaction([
      this.prisma.dmCampanha.update({
        where: { id },
        data: {
          financeiro_status: 'pago',
          status: campanha.status === 'aguardando_pagamento' ? 'agendada' : campanha.status,
          aprovado_em: new Date(),
          aprovado_por: aprovadoPor,
        },
      }),
    ]);

    return atualizada;
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
}
