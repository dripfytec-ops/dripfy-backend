import { IsNumber, IsOptional, Min } from 'class-validator';
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
