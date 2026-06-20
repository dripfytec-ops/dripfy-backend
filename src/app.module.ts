import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { LeadsModule } from './modules/leads/leads.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { CanaisModule } from './modules/canais/canais.module';
import { ChatwootModule } from './modules/chatwoot/chatwoot.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { MessagesModule } from './modules/messages/messages.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    LeadsModule,
    CampaignsModule,
    CanaisModule,
    ChatwootModule,
    WebhookModule,
    MessagesModule,
  ],
})
export class AppModule {}
