import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCanalDto, UpdateCanalDto } from './canais.dto';
import axios from 'axios';

@Injectable()
export class CanaisService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCanalDto) {
    return this.prisma.canal.create({
      data: { tenant_id: tenantId, ...dto },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.canal.findMany({
      where: { tenant_id: tenantId },
      orderBy: { criado_em: 'asc' },
      select: {
        id: true,
        nome: true,
        phone_number_id: true,
        waba_id: true,
        template_boas_vindas: true,
        chatwoot_inbox_id: true,
        ativo: true,
        criado_em: true,
      },
    });
  }

  async update(tenantId: string, canalId: string, dto: UpdateCanalDto) {
    await this.ensureOwner(tenantId, canalId);
    return this.prisma.canal.update({
      where: { id: canalId },
      data: dto,
    });
  }

  async remove(tenantId: string, canalId: string) {
    await this.ensureOwner(tenantId, canalId);
    return this.prisma.canal.delete({ where: { id: canalId } });
  }

  async listTemplates(tenantId: string, canalId: string) {
    const canal = await this.ensureOwner(tenantId, canalId);

    const { data } = await axios.get(
      `https://graph.facebook.com/v20.0/${canal.waba_id}/message_templates`,
      {
        headers: { Authorization: `Bearer ${canal.meta_access_token}` },
        params: { fields: 'name,status,language,category,components', limit: 100 },
      },
    );

    return data.data?.filter((t: any) => t.status === 'APPROVED') || [];
  }

  async findByPhoneNumberId(tenantId: string, phoneNumberId: string) {
    return this.prisma.canal.findFirst({
      where: { tenant_id: tenantId, phone_number_id: phoneNumberId, ativo: true },
    });
  }

  async findByPhoneNumberIdGlobal(phoneNumberId: string) {
    return this.prisma.canal.findFirst({
      where: { phone_number_id: phoneNumberId, ativo: true },
    });
  }

  async findFirstActive(tenantId: string) {
    return this.prisma.canal.findFirst({
      where: { tenant_id: tenantId, ativo: true },
      orderBy: { criado_em: 'asc' },
    });
  }

  private async ensureOwner(tenantId: string, canalId: string) {
    const canal = await this.prisma.canal.findUnique({ where: { id: canalId } });
    if (!canal) throw new NotFoundException('Canal não encontrado.');
    if (canal.tenant_id !== tenantId) throw new ForbiddenException('Acesso negado.');
    return canal;
  }
}
