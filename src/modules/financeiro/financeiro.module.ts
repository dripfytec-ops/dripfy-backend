import { Module } from '@nestjs/common';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroService } from './financeiro.service';
import { PixGatewayService, AsaasPixGatewayService } from './pix-gateway.service';

@Module({
  controllers: [FinanceiroController],
  providers: [FinanceiroService, { provide: PixGatewayService, useClass: AsaasPixGatewayService }],
  exports: [FinanceiroService],
})
export class FinanceiroModule {}
