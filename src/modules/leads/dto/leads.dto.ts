import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLeadEtiquetaDto {
  @IsString()
  etiqueta_id: string;
}

export class AssignVendedorDto {
  @IsOptional()
  @IsString()
  vendedor_id: string | null;
}

export class FilterLeadsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  etiqueta_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ enum: ['recent', 'default'] })
  @IsOptional()
  @IsString()
  sort?: 'recent' | 'default';
}
