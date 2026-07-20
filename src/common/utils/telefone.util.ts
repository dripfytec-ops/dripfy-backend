// Números de celular BR têm um "9" extra antes do número de 8 dígitos, mas a
// Meta às vezes envia o wa_id (campo "from" do webhook) sem esse dígito mesmo
// quando o contato foi salvo com ele — e vice-versa. Buscar só pelo telefone
// exato faz o lead não ser encontrado e cria um segundo lead/conversa pro
// mesmo contato. Essa função gera as variantes possíveis pra usar num "in".
export function telefoneVariantes(telefone: string): string[] {
  const digits = telefone.replace(/\D/g, '');
  const variantes = new Set([digits]);

  // 55 + DDD(2) + 9 + numero(8) = 13 dígitos → variante sem o 9
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    variantes.add(digits.slice(0, 4) + digits.slice(5));
  }
  // 55 + DDD(2) + numero(8) = 12 dígitos → variante com o 9
  if (digits.length === 12 && digits.startsWith('55')) {
    variantes.add(digits.slice(0, 4) + '9' + digits.slice(4));
  }

  return Array.from(variantes);
}
