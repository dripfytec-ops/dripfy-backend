import { Module } from '@nestjs/common';
import { AdminCampanhasJmdController } from './admin-campanhas-jmd.controller';
import { AdminCampanhasJmdService } from './admin-campanhas-jmd.service';

@Module({
  controllers: [AdminCampanhasJmdController],
  providers: [AdminCampanhasJmdService],
})
export class AdminCampanhasJmdModule {}
