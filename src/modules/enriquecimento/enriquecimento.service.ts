import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EnriquecimentoService {
  constructor(private prisma: PrismaService) {}

  async criar(tenantId: string, nomeArquivo: string, arquivoUrl: string, observacoes?: string) {
    return this.prisma.enriquecimentoSolicitacao.create({
      data: { tenant_id: tenantId, nome_arquivo_original: nomeArquivo, arquivo_original_url: arquivoUrl, observacoes },
    });
  }

  async listar(tenantId: string) {
    return this.prisma.enriquecimentoSolicitacao.findMany({
      where: { tenant_id: tenantId },
      orderBy: { criado_em: 'desc' },
    });
  }

  // [Master] Lista de todos os tenants, pendentes primeiro.
  async listarParaMaster() {
    return this.prisma.enriquecimentoSolicitacao.findMany({
      orderBy: [{ status: 'asc' }, { criado_em: 'desc' }],
      include: { tenant: { select: { id: true, nome_empresa: true, slug: true } } },
    });
  }

  // [Master] Devolve o arquivo já higienizado, marcando a solicitação como concluída.
  async concluir(id: string, arquivoProcessadoUrl: string, concluidoPor: string) {
    const solicitacao = await this.prisma.enriquecimentoSolicitacao.findUnique({ where: { id } });
    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada.');

    return this.prisma.enriquecimentoSolicitacao.update({
      where: { id },
      data: {
        status: 'concluido',
        arquivo_processado_url: arquivoProcessadoUrl,
        concluido_em: new Date(),
        concluido_por: concluidoPor,
      },
    });
  }
}
