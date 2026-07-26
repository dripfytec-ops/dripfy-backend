import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AtualizarPlanoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  usuarios_inclusos?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_mensalidade_base?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_usuario_adicional?: number;
}
