import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import FormData = require('form-data');

const API_VERSION = process.env.META_API_VERSION || 'v20.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

@Injectable()
export class MetaService {
  async obterInfoNumero({ phoneNumberId, accessToken }: { phoneNumberId: string; accessToken: string }) {
    try {
      const { data } = await axios.get(`${BASE_URL}/${phoneNumberId}`, {
        params: { fields: 'quality_rating,throughput,name_status,display_phone_number' },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return data;
    } catch (e: any) {
      throw new BadRequestException(e.response?.data?.error?.message || 'Erro ao buscar qualidade do número');
    }
  }

  // pricing_analytics é leitura, não gera cobrança — expõe o custo real já
  // batido pela conta (em vez de estimar por categoria de template).
  async obterCustoWaba({ wabaId, accessToken, diasAtras = 30 }: { wabaId: string; accessToken: string; diasAtras?: number }) {
    const now = Math.floor(Date.now() / 1000);
    const start = now - diasAtras * 24 * 3600;
    try {
      const [infoRes, pricingRes] = await Promise.all([
        axios.get(`${BASE_URL}/${wabaId}`, { params: { fields: 'currency' }, headers: { Authorization: `Bearer ${accessToken}` } }),
        axios.get(`${BASE_URL}/${wabaId}`, {
          params: { fields: `pricing_analytics.start(${start}).end(${now}).granularity(DAILY)` },
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      const pontos = pricingRes.data?.pricing_analytics?.data?.[0]?.data_points || [];
      let volume = 0;
      let custo = 0;
      for (const p of pontos) {
        volume += p.volume || 0;
        custo += p.cost || 0;
      }
      return { moeda: infoRes.data.currency || null, volume, custo };
    } catch (e: any) {
      throw new BadRequestException(e.response?.data?.error?.message || 'Erro ao buscar custo da WABA');
    }
  }

  async listarTemplates({ wabaId, accessToken }: { wabaId: string; accessToken: string }) {
    try {
      const { data } = await axios.get(`${BASE_URL}/${wabaId}/message_templates`, {
        params: { fields: 'id,name,status,category,language,components', limit: 50 },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return data.data || [];
    } catch (e: any) {
      throw new BadRequestException(e.response?.data?.error?.message || 'Erro ao buscar templates');
    }
  }

  // Upload direto de mídia (recomendado pela própria Meta em vez de "link"):
  // envia os bytes pra Meta agora e retorna um media_id, que não depende do
  // nosso servidor estar disponível quando o destinatário abrir a mensagem.
  async uploadMedia({
    phoneNumberId, accessToken, buffer, mimeType, filename,
  }: {
    phoneNumberId: string; accessToken: string; buffer: Buffer; mimeType: string; filename: string;
  }): Promise<string> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', buffer, { filename, contentType: mimeType });

    try {
      const { data } = await axios.post(`${BASE_URL}/${phoneNumberId}/media`, form, {
        headers: { Authorization: `Bearer ${accessToken}`, ...form.getHeaders() },
      });
      return data.id;
    } catch (e: any) {
      throw new BadRequestException(e.response?.data?.error?.message || 'Erro ao enviar mídia pra Meta');
    }
  }

  async enviarTemplate({
    phoneNumberId, accessToken, telefone, templateName, params = [], language = 'pt_BR', headerImageUrl,
  }: {
    phoneNumberId: string; accessToken: string; telefone: string; templateName: string;
    params?: string[]; language?: string; headerImageUrl?: string;
  }) {
    const components: any[] = [];
    if (headerImageUrl) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: headerImageUrl } }] });
    if (params.length > 0) components.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) });

    const body = {
      messaging_product: 'whatsapp',
      to: telefone.replace(/\D/g, ''),
      type: 'template',
      template: { name: templateName, language: { code: language }, ...(components.length > 0 && { components }) },
    };

    try {
      const { data } = await axios.post(`${BASE_URL}/${phoneNumberId}/messages`, body, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      return data;
    } catch (e: any) {
      throw new Error(e.response?.data?.error?.message || 'Erro ao enviar mensagem');
    }
  }
}
