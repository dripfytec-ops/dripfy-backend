import { IsString, IsOptional, IsInt, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCanalDto {
  @ApiProperty({ example: 'Vendas' })
  @IsString()
  nome: string;

  @ApiProperty({ example: '110833535375707443' })
  @IsString()
  phone_number_id: string;

  @ApiProperty({ example: '2430248527473659' })
  @IsString()
  waba_id: string;

  @ApiProperty({ example: 'EAAxxxxxxxx' })
  @IsString()
  meta_access_token: string;

  @ApiPropertyOptional({ example: 'boas_vindas' })
  @IsOptional()
  @IsString()
  template_boas_vindas?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  chatwoot_inbox_id?: number;
}

export class UpdateCanalDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  phone_number_id?: string;

  @IsOptional()
  @IsString()
  waba_id?: string;

  @IsOptional()
  @IsString()
  meta_access_token?: string;

  @IsOptional()
  @IsString()
  template_boas_vindas?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  chatwoot_inbox_id?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
