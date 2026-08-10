import { Module } from '@nestjs/common';
import { OdysseiaClientService } from './odysseia-client.service';

@Module({
  providers: [OdysseiaClientService],
  exports: [OdysseiaClientService],
})
export class OdysseiaModule {}
