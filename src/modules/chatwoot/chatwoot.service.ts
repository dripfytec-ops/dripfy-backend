import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChatwootService {
  private readonly logger = new Logger(ChatwootService.name);

  constructor(private prisma: PrismaService) {}

  async saveConfig(tenantId: string, dto: { chatwoot_url: string; chatwoot_api_token: string }) {
    return this.prisma.chatwootConfig.upsert({
      where: { tenant_id: tenantId },
      update: dto,
      create: { tenant_id: tenantId, ...dto },
    });
  }

  async getConfig(tenantId: string) {
    return this.prisma.chatwootConfig.findUnique({
      where: { tenant_id: tenantId },
      select: { id: true, chatwoot_url: true },
    });
  }

  async createOrUpdateContact(tenantId: string, nome: string, telefone: string): Promise<number | null> {
    const config = await this.prisma.chatwootConfig.findUnique({ where: { tenant_id: tenantId } });
    if (!config) return null;

    try {
      const accountId = await this.getAccountId(config.chatwoot_url, config.chatwoot_api_token);

      const search = await axios.get(
        `${config.chatwoot_url}/api/v1/accounts/${accountId}/contacts/search`,
        {
          headers: { api_access_token: config.chatwoot_api_token },
          params: { q: telefone, include_contacts: true },
        },
      );

      if (search.data?.payload?.length > 0) {
        return search.data.payload[0].id;
      }

      const created = await axios.post(
        `${config.chatwoot_url}/api/v1/accounts/${accountId}/contacts`,
        { name: nome, phone_number: `+${telefone}` },
        { headers: { api_access_token: config.chatwoot_api_token } },
      );

      return created.data?.id || null;
    } catch (e) {
      this.logger.error(`Chatwoot createContact error: ${e.message}`);
      return null;
    }
  }

  async createConversation(tenantId: string, contactId: number, message: string, inboxId?: number): Promise<void> {
    const config = await this.prisma.chatwootConfig.findUnique({ where: { tenant_id: tenantId } });
    if (!config || !inboxId) return;

    try {
      const accountId = await this.getAccountId(config.chatwoot_url, config.chatwoot_api_token);

      const conv = await axios.post(
        `${config.chatwoot_url}/api/v1/accounts/${accountId}/conversations`,
        { contact_id: contactId, inbox_id: inboxId },
        { headers: { api_access_token: config.chatwoot_api_token } },
      );

      const convId = conv.data?.id;
      if (!convId) return;

      await axios.post(
        `${config.chatwoot_url}/api/v1/accounts/${accountId}/conversations/${convId}/messages`,
        { content: message, message_type: 'outgoing', private: false },
        { headers: { api_access_token: config.chatwoot_api_token } },
      );
    } catch (e) {
      this.logger.error(`Chatwoot createConversation error: ${e.message}`);
    }
  }

  private async getAccountId(url: string, token: string): Promise<number> {
    const { data } = await axios.get(`${url}/api/v1/profile`, {
      headers: { api_access_token: token },
    });
    return data?.account_id || 1;
  }
}
