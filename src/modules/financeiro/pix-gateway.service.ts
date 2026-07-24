import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';

export interface CriarCobrancaPixInput {
  valor: number;
  descricao: string;
  referenciaExterna: string;
  nomeCliente: string;
  documentoCliente?: string;
}

export interface CobrancaPixResult {
  gatewayPaymentId: string;
  qrCodeBase64: string;
  copiaCola: string;
}

// Abstração do gateway de pagamento PIX. Hoje só existe implementação para a
// Asaas (chave única no header, sem fluxo OAuth — o mais simples de configurar
// pra cobrança recorrente de SaaS). Trocar para Mercado Pago exigiria uma
// nova classe implementando esta mesma interface.
@Injectable()
export abstract class PixGatewayService {
  abstract criarCobrancaPix(input: CriarCobrancaPixInput): Promise<CobrancaPixResult>;
}

@Injectable()
export class AsaasPixGatewayService extends PixGatewayService {
  private readonly logger = new Logger(AsaasPixGatewayService.name);
  private readonly apiKey = process.env.ASAAS_API_KEY;
  private readonly baseUrl = process.env.ASAAS_ENV === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';

  async criarCobrancaPix(input: CriarCobrancaPixInput): Promise<CobrancaPixResult> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'Gateway de pagamento PIX (Asaas) não configurado. Defina ASAAS_API_KEY (e opcionalmente ASAAS_ENV=production) nas variáveis de ambiente.',
      );
    }

    const headers = { access_token: this.apiKey };

    try {
      const clienteResp = await axios.post(
        `${this.baseUrl}/customers`,
        { name: input.nomeCliente, cpfCnpj: input.documentoCliente || undefined, externalReference: input.referenciaExterna },
        { headers },
      );
      const customerId = clienteResp.data.id;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);

      const cobrancaResp = await axios.post(
        `${this.baseUrl}/payments`,
        {
          customer: customerId,
          billingType: 'PIX',
          value: input.valor,
          dueDate: dueDate.toISOString().slice(0, 10),
          description: input.descricao,
          externalReference: input.referenciaExterna,
        },
        { headers },
      );
      const paymentId = cobrancaResp.data.id;

      const qrResp = await axios.get(`${this.baseUrl}/payments/${paymentId}/pixQrCode`, { headers });

      return {
        gatewayPaymentId: paymentId,
        qrCodeBase64: qrResp.data.encodedImage,
        copiaCola: qrResp.data.payload,
      };
    } catch (error: any) {
      const msg = error?.response?.data?.errors?.[0]?.description || error.message;
      this.logger.error(`Erro ao criar cobrança PIX na Asaas: ${msg}`);
      throw new ServiceUnavailableException(`Erro ao gerar cobrança PIX: ${msg}`);
    }
  }
}
