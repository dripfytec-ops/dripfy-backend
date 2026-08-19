import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { ChatwootModule } from '../chatwoot/chatwoot.module';
import { DisparoMassaModule } from '../disparo-massa/disparo-massa.module';
import { MediaModule } from '../../common/media/media.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { AtribuicaoLeadsModule } from '../leads/atribuicao-leads.module';

@Module({
  imports: [ChatwootModule, DisparoMassaModule, MediaModule, FinanceiroModule, AtribuicaoLeadsModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
