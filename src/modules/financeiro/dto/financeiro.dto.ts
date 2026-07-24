import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ComprarCreditosDto {
  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantidade_creditos: number;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  valor_total: number;
}
