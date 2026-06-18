import { Module } from '@nestjs/common';
import { CanaisService } from './canais.service';
import { CanaisController } from './canais.controller';

@Module({
  controllers: [CanaisController],
  providers: [CanaisService],
  exports: [CanaisService],
})
export class CanaisModule {}
