import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { ChatwootModule } from '../chatwoot/chatwoot.module';
import { CanaisModule } from '../canais/canais.module';

@Module({
  imports: [ChatwootModule, CanaisModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
