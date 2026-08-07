import { IsString, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDmCanalDto {
  @ApiProperty() @IsString() nome: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefone?: string;
  @ApiProperty() @IsString() waba_id: string;
  @ApiProperty() @IsString() phone_number_id: string;
  @ApiProperty() @IsString() access_token: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bm_nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) lote_size?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) delay_ms?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() mensagem_boas_vindas?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() saudacao_ativa?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() chatwoot_inbox_id?: number;
}

export class UpdateDmCanalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() waba_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone_number_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() access_token?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bm_nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) lote_size?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) delay_ms?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() mensagem_boas_vindas?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() saudacao_ativa?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() chatwoot_inbox_id?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativo?: boolean;
}
