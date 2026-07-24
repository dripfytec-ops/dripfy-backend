import { Controller, Post, Get, Query, Body, Param, Headers, Logger, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { FinanceiroService } from '../financeiro/financeiro.service';

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly financeiroService: FinanceiroService,
  ) {}

  // Confirmação de pagamento PIX (Asaas). O token de segurança vem no header
  // configurado no painel do gateway — sem ele o pedido é rejeitado (ver
  // FinanceiroService.processarWebhookPagamento).
  @Post('pagamento')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recebe confirmação de pagamento PIX do gateway e credita o tenant' })
  async pagamentoWebhook(
    @Headers('asaas-access-token') token: string | undefined,
    @Body() body: any,
  ) {
    return this.financeiroService.processarWebhookPagamento(token, body);
  }

  // Verificação global do webhook pela Meta (sem slug — recomendado para multi-tenant)
  @Get('meta')
  @ApiOperation({ summary: 'Verificação do Webhook Meta global (GET)' })
  verifyMetaGlobal(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      this.logger.log('Webhook Meta global verificado.');
      return challenge;
    }
    return { status: 'forbidden' };
  }

  // Recebimento global de eventos Meta (identifica tenant pelo phone_number_id)
  @Post('meta')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recebe eventos do Webhook Meta global (POST)' })
  async receiveMetaGlobal(@Body() body: any) {
    await this.webhookService.processMetaGlobal(body);
    return { status: 'ok' };
  }

  // Verificação do webhook pela Meta (com slug — mantido para compatibilidade)
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

  // Recebimento de mensagens via webhook Meta (com slug — mantido para compatibilidade)
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
