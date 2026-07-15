import { Module } from '@nestjs/common';
import { DisparoMassaController } from './disparo-massa.controller';
import { DmCanaisService } from './dm-canais.service';
import { DmCampanhasService } from './dm-campanhas.service';
import { MetaService } from './meta.service';

@Module({
  controllers: [DisparoMassaController],
  providers: [DmCanaisService, DmCampanhasService, MetaService],
  exports: [DmCanaisService],
})
export class DisparoMassaModule {}
