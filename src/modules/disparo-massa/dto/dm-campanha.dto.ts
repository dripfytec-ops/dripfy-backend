import { Type } from 'class-transformer';
import {
  IsString, IsOptional, IsArray, IsDateString, ValidateNested, IsEnum, ArrayMinSize, IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DmCampanhaStatus, DmCampanhaPrioridade, DmMidiaTipo } from '@prisma/client';

export class ContatoCsvDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cpf?: string;
  @ApiProperty() @IsString() telefone: string;
}

export class CreateDmCampanhaDto {
  @ApiProperty() @IsString() nome: string;
  @ApiProperty() @IsString() canal_id: string;
  @ApiProperty() @IsString() template_name: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() template_params?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() header_image_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() agendado_para?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vendedor_id?: string;

  @ApiProperty({ type: [ContatoCsvDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ContatoCsvDto)
  contatos: ContatoCsvDto[];
}

export class PatchDmCampanhaDto {
  @ApiPropertyOptional({ enum: DmCampanhaStatus }) @IsOptional() @IsEnum(DmCampanhaStatus) status?: DmCampanhaStatus;
}

export class CreateDripifyCampanhaDto {
  @ApiProperty() @IsString() nome: string;
  @ApiPropertyOptional() @IsOptional() @IsString() canal_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() foto_perfil_url?: string;

  @ApiProperty() @IsString() mensagem_texto: string;
  @ApiPropertyOptional() @IsOptional() @IsString() link_botao?: string;

  @ApiPropertyOptional({ enum: DmMidiaTipo }) @IsOptional() @IsEnum(DmMidiaTipo) midia_tipo?: DmMidiaTipo;
  @ApiPropertyOptional() @IsOptional() @IsString() midia_url?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() salvar_como_modelo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() nome_modelo?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() agendado_para?: string;
  @ApiPropertyOptional({ enum: DmCampanhaPrioridade }) @IsOptional() @IsEnum(DmCampanhaPrioridade) prioridade?: DmCampanhaPrioridade;

  @ApiProperty({ type: [ContatoCsvDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ContatoCsvDto)
  contatos: ContatoCsvDto[];
}
