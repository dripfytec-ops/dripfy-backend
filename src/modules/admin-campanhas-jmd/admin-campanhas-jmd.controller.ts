import { Body, Controller, Get, Patch, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AdminCampanhasJmdService } from './admin-campanhas-jmd.service';
import { ConfigurarOdysseiaDto } from './dto/configurar-odysseia.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('admin-demandas-dripfy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin_master)
@Controller('admin/demandas-dripfy')
export class AdminCampanhasJmdController {
  constructor(private readonly service: AdminCampanhasJmdService) {}

  @Get()
  @ApiOperation({ summary: '[Master] Lista todas as demandas de Disparo Dripfy de todos os tenants' })
  findAll() {
    return this.service.findAll();
  }

  @Patch(':id/aprovar')
  @ApiOperation({ summary: '[Master] Confirma pagamento e libera a demanda pra execução' })
  aprovar(@Param('id') id: string, @CurrentUser('nome') masterName: string) {
    return this.service.aprovar(id, masterName);
  }

  @Get(':id/export-csv')
  @ApiOperation({ summary: '[Master] Exporta os contatos da demanda no formato pra execução manual' })
  async exportCsv(@Param('id') id: string, @Res() res: Response) {
    const { filename, csv } = await this.service.exportarContatosCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(String.fromCharCode(0xFEFF) + csv);
  }

  @Get('odysseia/templates')
  @ApiOperation({ summary: '[Master] Lista os templates de WhatsApp cadastrados no painel da Odysseia' })
  listarTemplatesOdysseia() {
    return this.service.listarTemplatesOdysseia();
  }

  @Patch(':id/odysseia')
  @ApiOperation({ summary: '[Master] Configura a demanda pra ser executada via Odysseia (template + fonte de resposta + agendamento)' })
  configurarOdysseia(@Param('id') id: string, @Body() dto: ConfigurarOdysseiaDto) {
    return this.service.configurarOdysseia(id, dto);
  }

  @Post(':id/disparar-odysseia')
  @ApiOperation({ summary: '[Master] Dispara a demanda via API da Odysseia (WhatsApp agendado)' })
  dispararViaOdysseia(@Param('id') id: string) {
    return this.service.dispararViaOdysseia(id);
  }
}
