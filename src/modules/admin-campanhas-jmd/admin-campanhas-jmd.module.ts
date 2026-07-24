import { Module } from '@nestjs/common';
import { AdminCampanhasJmdController } from './admin-campanhas-jmd.controller';
import { AdminCampanhasJmdService } from './admin-campanhas-jmd.service';
import { FinanceiroModule } from '../financeiro/financeiro.module';

@Module({
  imports: [FinanceiroModule],
  controllers: [AdminCampanhasJmdController],
  providers: [AdminCampanhasJmdService],
})
export class AdminCampanhasJmdModule {}
