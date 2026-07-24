import { Module } from '@nestjs/common';
import { DisparoMassaController } from './disparo-massa.controller';
import { DmCanaisService } from './dm-canais.service';
import { DmCampanhasService } from './dm-campanhas.service';
import { MetaService } from './meta.service';
import { MediaModule } from '../../common/media/media.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';

@Module({
  imports: [MediaModule, FinanceiroModule],
  controllers: [DisparoMassaController],
  providers: [DmCanaisService, DmCampanhasService, MetaService],
  exports: [DmCanaisService, MetaService, DmCampanhasService],
})
export class DisparoMassaModule {}
