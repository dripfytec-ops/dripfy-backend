import { Module } from '@nestjs/common';
import { AdminCampanhasJmdController } from './admin-campanhas-jmd.controller';
import { AdminCampanhasJmdService } from './admin-campanhas-jmd.service';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { OdysseiaModule } from '../odysseia/odysseia.module';

@Module({
  imports: [FinanceiroModule, OdysseiaModule],
  controllers: [AdminCampanhasJmdController],
  providers: [AdminCampanhasJmdService],
})
export class AdminCampanhasJmdModule {}
