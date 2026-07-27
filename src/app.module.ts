import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AssinaturaGuard } from './common/guards/assinatura.guard';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { LeadsModule } from './modules/leads/leads.module';
import { DisparoMassaModule } from './modules/disparo-massa/disparo-massa.module';
import { ChatwootModule } from './modules/chatwoot/chatwoot.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { MessagesModule } from './modules/messages/messages.module';
import { EtiquetasModule } from './modules/etiquetas/etiquetas.module';
import { BmTokensModule } from './modules/bm-tokens/bm-tokens.module';
import { QuickRepliesModule } from './modules/quick-replies/quick-replies.module';
import { FinanceiroModule } from './modules/financeiro/financeiro.module';
import { AdminCampanhasJmdModule } from './modules/admin-campanhas-jmd/admin-campanhas-jmd.module';
import { AssinaturaModule } from './modules/assinatura/assinatura.module';
import { EnriquecimentoModule } from './modules/enriquecimento/enriquecimento.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    LeadsModule,
    DisparoMassaModule,
    ChatwootModule,
    WebhookModule,
    MessagesModule,
    EtiquetasModule,
    BmTokensModule,
    QuickRepliesModule,
    FinanceiroModule,
    AdminCampanhasJmdModule,
    AssinaturaModule,
    EnriquecimentoModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AssinaturaGuard }],
})
export class AppModule {}
