import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ComprarCreditosDto {
  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantidade_creditos: number;

  // Ignorado pelo backend (o preço real é sempre recalculado no servidor) —
  // mantido opcional só por compatibilidade com clientes antigos.
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  valor_total?: number;
}

export class AjustarCreditosDto {
  // Positivo = credita (ex: reembolso de contatos com falha no disparo).
  // Negativo = debita.
  @ApiProperty()
  @IsInt()
  quantidade: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  descricao: string;
}
