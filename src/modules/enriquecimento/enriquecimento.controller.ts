import { BadRequestException, Body, Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EnriquecimentoService } from './enriquecimento.service';
import { MediaService } from '../../common/media/media.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('enriquecimento')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('enriquecimento')
export class EnriquecimentoController {
  constructor(
    private readonly service: EnriquecimentoService,
    private readonly mediaService: MediaService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sobe uma planilha de leads pra higienização de telefones' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('observacoes') observacoes: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    const relativeUrl = this.mediaService.saveBuffer(file.buffer, file.mimetype);
    return this.service.criar(tenantId, file.originalname, this.mediaService.publicUrl(relativeUrl), observacoes);
  }

  @Get()
  @ApiOperation({ summary: 'Lista as solicitações de enriquecimento do tenant' })
  listar(@CurrentUser('tenant_id') tenantId: string) {
    return this.service.listar(tenantId);
  }
}
