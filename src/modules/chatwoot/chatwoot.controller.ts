import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatwootService } from './chatwoot.service';
import { SaveChatwootConfigDto } from './chatwoot.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('chatwoot-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chatwoot')
export class ChatwootController {
  constructor(private readonly chatwootService: ChatwootService) {}

  @Post('config')
  @ApiOperation({ summary: 'Salva configuração do Chatwoot' })
  saveConfig(
    @CurrentUser('tenant_id') tenantId: string,
    @Body() dto: SaveChatwootConfigDto,
  ) {
    return this.chatwootService.saveConfig(tenantId, dto);
  }

  @Get('config')
  @ApiOperation({ summary: 'Retorna configuração Chatwoot' })
  getConfig(@CurrentUser('tenant_id') tenantId: string) {
    return this.chatwootService.getConfig(tenantId);
  }
}
