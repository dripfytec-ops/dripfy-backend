import {
  Controller, Get, Post, Patch, Put, Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFile, ParseIntPipe, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { SetEtiquetasDto, AssignVendedorDto, UpdateLeadDto, FilterLeadsDto, StartConversationDto } from './dto/leads.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.leadsService.uploadExcel(tenantId, file);
  }

  @Post('bulk')
  bulk(
    @Body('text') text: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    if (!text) throw new BadRequestException('Nenhum texto enviado.');
    const clean = (text as string).replace(/\r/g, '');
    const lines = clean.split('\n').filter((l) => l.trim());
    const isTab = lines[0]?.includes('\t');
    const isSemi = lines[0]?.includes(';');
    const delim = isTab ? '\t' : isSemi ? ';' : '\t';
    const firstCols = lines[0].split(delim).map((c) => c.trim().toLowerCase());
    const hasHeader = firstCols.includes('nome') || firstCols.includes('name');
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const leads = dataLines.map((line) => {
      const cols = line.split(delim).map((c) => c.trim());
      return { nome: cols[0] || '', telefone: cols[1] || '', cpf: cols[2] || undefined };
    });
    return this.leadsService.bulkInsert(tenantId, leads);
  }

  @Get()
  findAll(
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Query() filters: FilterLeadsDto,
  ) {
    return this.leadsService.findAll(tenantId, filters, userId, role);
  }

  @Get('stats')
  stats(@CurrentUser('tenant_id') tenantId: string) {
    return this.leadsService.getStats(tenantId);
  }

  @Post('start-conversation')
  @ApiOperation({ summary: 'Cria/reaproveita lead pelo telefone e dispara template pra abrir a conversa' })
  startConversation(
    @CurrentUser('tenant_id') tenantId: string,
    @Body() dto: StartConversationDto,
  ) {
    return this.leadsService.startConversation(tenantId, dto);
  }

  @Get('vendedores')
  @Roles(UserRole.admin_master, UserRole.lojista_admin)
  listVendedores(@CurrentUser('tenant_id') tenantId: string) {
    return this.leadsService.listVendedores(tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza dados do lead (nome, telefone, cpf)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenant_id') tenantId: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.update(tenantId, id, dto);
  }

  @Put(':id/etiquetas')
  @ApiOperation({ summary: 'Define o conjunto de etiquetas do lead (suporta múltiplas)' })
  setEtiquetas(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('nome') userName: string,
    @Body() dto: SetEtiquetasDto,
  ) {
    return this.leadsService.setEtiquetas(tenantId, id, dto, userId, role, userName);
  }

  @Patch(':id/vendedor')
  @Roles(UserRole.admin_master, UserRole.lojista_admin)
  @ApiOperation({ summary: 'Atribui/transfere vendedor do lead' })
  assignVendedor(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('nome') adminName: string,
    @Body() dto: AssignVendedorDto,
  ) {
    return this.leadsService.assignVendedor(tenantId, id, dto, adminName);
  }

  @Patch(':id/assign-me')
  @ApiOperation({ summary: 'Ação rápida: atribui a conversa ao usuário logado' })
  assignToSelf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('nome') userName: string,
    @CurrentUser('role') role: string,
  ) {
    return this.leadsService.assignToSelf(tenantId, id, userId, userName, role);
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'Histórico de atividades (atribuição, etiquetas, transferência) do lead' })
  getActivities(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.leadsService.getActivities(tenantId, id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca a conversa do lead como lida ou não lida' })
  markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenant_id') tenantId: string,
    @Body('lida') lida?: boolean,
  ) {
    return this.leadsService.markRead(tenantId, id, lida ?? true);
  }
}
