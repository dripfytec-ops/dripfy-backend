import { Controller, Get, Post, Delete, Param, Body, ParseIntPipe, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
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

  @Delete('lead/:leadId')
  @ApiOperation({ summary: 'Apagar histórico de mensagens de um lead' })
  deleteByLead(
    @CurrentUser('tenant_id') tenantId: string,
    @Param('leadId', ParseIntPipe) leadId: number,
  ) {
    return this.messagesService.deleteByLead(tenantId, leadId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apagar uma mensagem específica' })
  deleteOne(
    @CurrentUser('tenant_id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.messagesService.deleteOne(tenantId, id);
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

  @Post('reply-media/:leadId')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Responder lead com áudio via WhatsApp (janela 24h)' })
  replyMedia(
    @CurrentUser('tenant_id') tenantId: string,
    @Param('leadId', ParseIntPipe) leadId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.messagesService.replyMedia(tenantId, leadId, file);
  }
}
