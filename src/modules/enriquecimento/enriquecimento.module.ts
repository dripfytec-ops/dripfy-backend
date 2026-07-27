import { Module } from '@nestjs/common';
import { EnriquecimentoController } from './enriquecimento.controller';
import { AdminEnriquecimentoController } from './admin-enriquecimento.controller';
import { EnriquecimentoService } from './enriquecimento.service';
import { MediaModule } from '../../common/media/media.module';

@Module({
  imports: [MediaModule],
  controllers: [EnriquecimentoController, AdminEnriquecimentoController],
  providers: [EnriquecimentoService],
})
export class EnriquecimentoModule {}
