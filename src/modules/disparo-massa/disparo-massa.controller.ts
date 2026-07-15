import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DmCanaisService } from './dm-canais.service';
import { DmCampanhasService } from './dm-campanhas.service';
import { CreateDmCanalDto, UpdateDmCanalDto } from './dto/dm-canal.dto';
import { CreateDmCampanhaDto, PatchDmCampanhaDto } from './dto/dm-campanha.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('disparo-massa')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disparo-massa')
export class DisparoMassaController {
  constructor(
    private readonly canaisService: DmCanaisService,
    private readonly campanhasService: DmCampanhasService,
  ) {}

  // ─── Canais ───────────────────────────────────────────────────────────
  @Get('canais')
  @ApiOperation({ summary: 'Lista canais oficiais WhatsApp do tenant' })
  listCanais(@CurrentUser('tenant_id') tenantId: string) {
    return this.canaisService.findAll(tenantId);
  }

  @Post('canais')
  @ApiOperation({ summary: 'Cadastra novo canal oficial WhatsApp' })
  createCanal(@CurrentUser('tenant_id') tenantId: string, @Body() dto: CreateDmCanalDto) {
    return this.canaisService.create(tenantId, dto);
  }

  @Patch('canais/:id')
  @ApiOperation({ summary: 'Atualiza canal (access_token só é sobrescrito se enviado)' })
  updateCanal(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string, @Body() dto: UpdateDmCanalDto) {
    return this.canaisService.update(tenantId, id, dto);
  }

  @Get('status-canais')
  @ApiOperation({ summary: 'Qualidade e custo (30d) de cada canal, direto da Meta' })
  statusCanais(@CurrentUser('tenant_id') tenantId: string) {
    return this.canaisService.obterStatusCanais(tenantId);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Lista templates aprovados de um canal' })
  templates(@CurrentUser('tenant_id') tenantId: string, @Query('canal_id') canalId: string) {
    if (!canalId) throw new BadRequestException('canal_id é obrigatório');
    return this.canaisService.listarTemplatesDoCanal(tenantId, canalId);
  }

  // ─── Campanhas ────────────────────────────────────────────────────────
  @Get('campanhas')
  @ApiOperation({ summary: 'Lista campanhas do tenant' })
  listCampanhas(@CurrentUser('tenant_id') tenantId: string) {
    return this.campanhasService.findAll(tenantId);
  }

  @Post('campanhas')
  @ApiOperation({ summary: 'Cria campanha + contatos (CSV já parseado pelo frontend)' })
  createCampanha(@CurrentUser('tenant_id') tenantId: string, @Body() dto: CreateDmCampanhaDto) {
    return this.campanhasService.create(tenantId, dto);
  }

  @Get('campanhas/:id')
  @ApiOperation({ summary: 'Detalhe da campanha com todos os contatos' })
  getCampanha(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string) {
    return this.campanhasService.getOne(tenantId, id);
  }

  @Patch('campanhas/:id')
  @ApiOperation({ summary: 'Atualiza status da campanha (ex: pausar)' })
  patchCampanha(@CurrentUser('tenant_id') tenantId: string, @Param('id') id: string, @Body() dto: PatchDmCampanhaDto) {
    return this.campanhasService.patch(tenantId, id, dto);
  }

  @Post('processar')
  @ApiOperation({ summary: 'Inicia (ou retoma) o loop de disparo da campanha' })
  processar(@CurrentUser('tenant_id') tenantId: string, @Body('campanha_id') campanhaId: string) {
    if (!campanhaId) throw new BadRequestException('campanha_id é obrigatório');
    return this.campanhasService.iniciarDisparo(tenantId, campanhaId);
  }
}
