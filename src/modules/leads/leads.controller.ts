import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFile, ParseIntPipe, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { UpdateLeadEtiquetaDto, AssignVendedorDto, FilterLeadsDto } from './dto/leads.dto';
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
    @Query('campanha_id') campanhaId?: string,
  ) {
    return this.leadsService.uploadExcel(tenantId, file, campanhaId);
  }

  @Post('bulk')
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

  @Get('kanban')
  kanban(
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.leadsService.findKanban(tenantId, userId, role);
  }

  @Get('vendedores')
  @Roles(UserRole.admin_master, UserRole.lojista_admin)
  listVendedores(@CurrentUser('tenant_id') tenantId: string) {
    return this.leadsService.listVendedores(tenantId);
  }

  @Patch(':id/etiqueta')
  @ApiOperation({ summary: 'Atualiza etiqueta do lead (drag-and-drop / dropdown)' })
  updateEtiqueta(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: UpdateLeadEtiquetaDto,
  ) {
    return this.leadsService.updateEtiqueta(tenantId, id, dto, userId, role);
  }

  @Patch(':id/vendedor')
  @Roles(UserRole.admin_master, UserRole.lojista_admin)
  @ApiOperation({ summary: 'Atribui vendedor ao lead' })
  assignVendedor(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenant_id') tenantId: string,
    @Body() dto: AssignVendedorDto,
  ) {
    return this.leadsService.assignVendedor(tenantId, id, dto);
  }
}
