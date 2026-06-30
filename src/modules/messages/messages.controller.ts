import { Controller, Get, Post, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('lead/:leadId')
  @ApiOperation({ summary: 'Histórico de mensagens de um lead' })
  getByLead(
    @CurrentUser('tenant_id') tenantId: string,
    @Param('leadId', ParseIntPipe) leadId: number,
  ) {
    return this.messagesService.getByLead(tenantId, leadId);
  }

  @Get()
  @ApiOperation({ summary: 'Últimas mensagens do tenant' })
  getRecent(@CurrentUser('tenant_id') tenantId: string) {
    return this.messagesService.getByTenant(tenantId);
  }

  @Post('reply/:leadId')
  @ApiOperation({ summary: 'Responder lead via WhatsApp (janela 24h)' })
  reply(
    @CurrentUser('tenant_id') tenantId: string,
    @Param('leadId', ParseIntPipe) leadId: number,
    @Body('texto') texto: string,
  ) {
    return this.messagesService.reply(tenantId, leadId, texto);
  }
}
