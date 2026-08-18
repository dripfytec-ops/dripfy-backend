import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { AtribuicaoLeadsService } from './atribuicao-leads.service';
import { DisparoMassaModule } from '../disparo-massa/disparo-massa.module';

@Module({
  imports: [DisparoMassaModule],
  controllers: [LeadsController],
  providers: [LeadsService, AtribuicaoLeadsService],
  exports: [LeadsService, AtribuicaoLeadsService],
})
export class LeadsModule {}
