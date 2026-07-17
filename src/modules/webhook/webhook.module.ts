import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { MediaService } from './media.service';
import { ChatwootModule } from '../chatwoot/chatwoot.module';
import { DisparoMassaModule } from '../disparo-massa/disparo-massa.module';

@Module({
  imports: [ChatwootModule, DisparoMassaModule],
  controllers: [WebhookController],
  providers: [WebhookService, MediaService],
})
export class WebhookModule {}
