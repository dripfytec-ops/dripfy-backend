import { Controller, Post, Get, Query, Body, Param, Logger, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  // Verificação do webhook pela Meta
  @Get('meta/:tenantSlug')
  @ApiOperation({ summary: 'Verificação do Webhook Meta (GET)' })
  verifyMeta(
    @Param('tenantSlug') tenantSlug: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      this.logger.log(`Webhook Meta verificado para tenant: ${tenantSlug}`);
      return challenge;
    }
    return { status: 'forbidden' };
  }

  // Recebimento de mensagens via webhook Meta
  @Post('meta/:tenantSlug')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recebe eventos do Webhook Meta (POST)' })
  async receiveMeta(@Param('tenantSlug') tenantSlug: string, @Body() body: any) {
    this.logger.log(`Webhook Meta recebido para ${tenantSlug}`);
    await this.webhookService.processMeta(tenantSlug, body);
    return { status: 'ok' };
  }

  // Endpoint público para inserir lead avulso e disparar mensagem imediata (Módulo D)
  @Post('lead/:tenantSlug')
  @HttpCode(200)
  @ApiOperation({ summary: 'Insere lead avulso e dispara mensagem imediata' })
  async newLead(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: { nome: string; telefone: string; cpf?: string },
  ) {
    return this.webhookService.insertLeadAndFireImmediate(tenantSlug, body);
  }
}
