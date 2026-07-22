import { Type } from 'class-transformer';
import {
  IsString, IsOptional, IsArray, IsDateString, ValidateNested, IsEnum, ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DmCampanhaStatus } from '@prisma/client';

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
