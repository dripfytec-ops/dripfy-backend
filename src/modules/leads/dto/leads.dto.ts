import { IsString, IsOptional, IsArray, IsNotEmpty } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SetEtiquetasDto {
  @IsArray()
  @IsString({ each: true })
  etiqueta_ids: string[];
}

export class AssignVendedorDto {
  @IsOptional()
  @IsString()
  vendedor_id: string | null;
}

export class UpdateLeadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cpf?: string;
}

export class StartConversationDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  @IsNotEmpty()
  telefone: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsString()
  @IsNotEmpty()
  canal_id: string;

  @IsString()
  @IsNotEmpty()
  template_name: string;

  @IsOptional()
  @IsArray()
  template_params?: string[];
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
  @IsString()
  origem_campanha_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendedor_id?: string;

  @ApiPropertyOptional({ description: 'true = mostra só conversas encerradas; padrão exclui as encerradas' })
  @IsOptional()
  encerradas?: boolean;

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
