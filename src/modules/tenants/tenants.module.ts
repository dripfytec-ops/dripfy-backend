import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { EtiquetasModule } from '../etiquetas/etiquetas.module';
import { AuthModule } from '../auth/auth.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';

@Module({
  imports: [EtiquetasModule, AuthModule, FinanceiroModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
