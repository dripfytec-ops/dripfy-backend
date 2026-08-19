import { Module } from '@nestjs/common';
import { AtribuicaoLeadsService } from './atribuicao-leads.service';

// Módulo próprio (sem depender de LeadsModule/DisparoMassaModule) pra evitar
// dependência circular — DisparoMassaModule e WebhookModule importam este
// módulo diretamente.
@Module({
  providers: [AtribuicaoLeadsService],
  exports: [AtribuicaoLeadsService],
})
export class AtribuicaoLeadsModule {}
