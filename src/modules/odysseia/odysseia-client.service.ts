import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';

const BASE_URL = process.env.ODYSSEIA_BASE_URL || 'https://api.odysseia.app/api';

export interface OdysseiaContato {
  telefone: string;
  nome?: string;
  cpf?: string;
}

export interface OdysseiaTemplateWhatsapp {
  id: string;
  name: string;
  message: string;
  updatedAt: string;
}

export interface OdysseiaCriarDisparoWhatsappPayload {
  scheduled_date: string; // YYYY-MM-DD
  scheduled_slot: string; // HH:MM
  template_id: string;
  receptive_fonte: string;
  idempotency_key: string;
  contatos: OdysseiaContato[];
}

export interface OdysseiaDisparoWhatsappCriado {
  id: string;
  status: string;
  contactCount: number;
  scheduledDate: string;
  scheduledSlot: string;
}

export interface OdysseiaCreditos {
  sms: { disponivel: number; comprados: number; bonus: number };
  whatsapp: { bonusContatos: number };
}

// Chave única da plataforma (não por tenant) — a demanda "Disparo Dripfy"
// já é executada pela Dripfy hoje (manualmente); isso só troca o "como".
@Injectable()
export class OdysseiaClientService {
  private headers() {
    const apiKey = process.env.ODYSSEIA_API_KEY;
    if (!apiKey) throw new InternalServerErrorException('ODYSSEIA_API_KEY não configurada no backend.');
    return { 'X-API-Key': apiKey };
  }

  // Erros mapeados conforme a doc da Odysseia (401/400/402/429) — preserva o
  // status original pra quem chamar poder reagir diferente (ex: 402 = sem
  // saldo, não é bem um "erro do usuário" e sim algo pro Master resolver).
  private handleError(e: any, contexto: string): never {
    const status = e.response?.status;
    const mensagem = e.response?.data?.message || e.response?.data?.error || `Erro ao ${contexto}`;
    if (status === 401) throw new UnauthorizedException(`Odysseia: ${mensagem}`);
    if (status === 402) throw new BadRequestException(`Odysseia: saldo insuficiente — ${mensagem}`);
    if (status === 429) throw new BadRequestException(`Odysseia: limite de requisições excedido, tente novamente em instantes.`);
    if (status === 400) throw new BadRequestException(`Odysseia: ${mensagem}`);
    throw new BadRequestException(`Odysseia: ${mensagem}`);
  }

  async listarTemplatesWhatsapp(): Promise<OdysseiaTemplateWhatsapp[]> {
    try {
      const { data } = await axios.get(`${BASE_URL}/v1/disparos/whatsapp/templates`, { headers: this.headers() });
      return data || [];
    } catch (e: any) {
      this.handleError(e, 'buscar templates de WhatsApp');
    }
  }

  async criarDisparoWhatsapp(payload: OdysseiaCriarDisparoWhatsappPayload): Promise<OdysseiaDisparoWhatsappCriado> {
    try {
      const { data } = await axios.post(`${BASE_URL}/v1/disparos/whatsapp`, payload, { headers: this.headers() });
      return data;
    } catch (e: any) {
      this.handleError(e, 'criar disparo de WhatsApp');
    }
  }

  async consultarDisparoWhatsapp(id: string): Promise<{ status: string; [key: string]: any }> {
    try {
      const { data } = await axios.get(`${BASE_URL}/v1/disparos/whatsapp/${id}`, { headers: this.headers() });
      return data;
    } catch (e: any) {
      this.handleError(e, 'consultar disparo de WhatsApp');
    }
  }

  async consultarCreditos(): Promise<OdysseiaCreditos> {
    try {
      const { data } = await axios.get(`${BASE_URL}/v1/disparos/creditos`, { headers: this.headers() });
      return data;
    } catch (e: any) {
      this.handleError(e, 'consultar créditos');
    }
  }
}
