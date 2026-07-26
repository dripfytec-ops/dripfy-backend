// Monta o payload "Pix Copia e Cola" (BR Code / EMV) pra uma chave estática.
// Espelha a lógica de frontend/src/components/financeiro/ModalPix.tsx — aqui
// aceita um valor fixo opcional (campo 54), útil quando o valor da cobrança
// já é conhecido de antemão (ex: mensalidade), diferente da compra de
// créditos onde o parceiro escolhe quanto pagar.
const CHAVE_PIX_FALLBACK = '3a357463-a308-4964-bb7e-fda3481518b4';
const MERCHANT_NOME = 'DRIPFY';
const MERCHANT_CIDADE = 'SAO PAULO';

function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

function crc16ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function montarPayloadPixEstatico(valor?: number): string {
  const merchantAccountInfo = tlv('00', 'br.gov.bcb.pix') + tlv('01', CHAVE_PIX_FALLBACK);
  let payload =
    tlv('00', '01') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    (valor != null ? tlv('54', valor.toFixed(2)) : '') +
    tlv('58', 'BR') +
    tlv('59', MERCHANT_NOME.substring(0, 25)) +
    tlv('60', MERCHANT_CIDADE.substring(0, 15)) +
    tlv('62', tlv('05', '***'));
  payload += '6304';
  return payload + crc16ccitt(payload);
}
