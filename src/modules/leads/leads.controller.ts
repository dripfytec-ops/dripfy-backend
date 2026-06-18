import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFile, ParseIntPipe, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { UpdateLeadStatusDto, FilterLeadsDto } from './dto/leads.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de planilha Excel/CSV de leads' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('tenant_id') tenantId: string,
    @Query('campanha_id') campanhaId?: string,
  ) {
    return this.leadsService.uploadExcel(tenantId, file, campanhaId);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Importa leads via colar/paste (texto separado por tab ou ponto-e-vírgula)' })
  bulk(
    @Body('text') text: string,
    @CurrentUser('tenant_id') tenantId: string,
    @Query('campanha_id') campanhaId?: string,
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
    return this.leadsService.bulkInsert(tenantId, leads, campanhaId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista leads com filtros e paginação (Modo Planilha)' })
  findAll(
    @CurrentUser('tenant_id') tenantId: string,
    @Query() filters: FilterLeadsDto,
  ) {
    return this.leadsService.findAll(tenantId, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas gerais de leads e mensagens' })
  stats(@CurrentUser('tenant_id') tenantId: string) {
    return this.leadsService.getStats(tenantId);
  }

  @Get('kanban')
  @ApiOperation({ summary: 'Retorna leads agrupados por status (Modo Kanban)' })
  kanban(@CurrentUser('tenant_id') tenantId: string) {
    return this.leadsService.findKanban(tenantId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualiza status do lead (drag-and-drop Kanban)' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenant_id') tenantId: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.leadsService.updateStatus(tenantId, id, dto);
  }
}
