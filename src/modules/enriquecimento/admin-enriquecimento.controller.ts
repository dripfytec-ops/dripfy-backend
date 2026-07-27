import { BadRequestException, Controller, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EnriquecimentoService } from './enriquecimento.service';
import { MediaService } from '../../common/media/media.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('admin-enriquecimento')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin_master)
@Controller('admin/enriquecimento')
export class AdminEnriquecimentoController {
  constructor(
    private readonly service: EnriquecimentoService,
    private readonly mediaService: MediaService,
  ) {}

  @Get()
  @ApiOperation({ summary: '[Master] Lista todas as solicitações de enriquecimento (todos os tenants)' })
  listar() {
    return this.service.listarParaMaster();
  }

  @Post(':id/concluir')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '[Master] Devolve a planilha já higienizada, concluindo a solicitação' })
  async concluir(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('nome') nomeMaster: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    const relativeUrl = this.mediaService.saveBuffer(file.buffer, file.mimetype);
    return this.service.concluir(id, this.mediaService.publicUrl(relativeUrl), nomeMaster);
  }

  @Get('compras')
  @ApiOperation({ summary: '[Master] Lista compras de créditos de enriquecimento (todos os tenants)' })
  listarCompras() {
    return this.service.listarComprasParaMaster();
  }

  @Patch('compras/:id/confirmar-pagamento')
  @ApiOperation({ summary: '[Master] Confirma manualmente o pagamento de uma compra de créditos de enriquecimento' })
  confirmarPagamentoCompra(@Param('id') id: string) {
    return this.service.confirmarPagamentoCompra(id);
  }
}
