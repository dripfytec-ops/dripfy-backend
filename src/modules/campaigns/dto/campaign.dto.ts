import { IsString, IsInt, Min, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Campanha Natal 2025' })
  @IsString()
  nome_campanha: string;

  @ApiProperty({ example: 'boas_vindas_v1' })
  @IsString()
  template_name: string;

  @ApiProperty({ description: 'ID do canal WhatsApp a utilizar' })
  @IsString()
  canal_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  template_params?: Record<string, any>;

  @ApiProperty({ example: 60, description: 'Delay em segundos entre cada disparo' })
  @IsInt()
  @Min(10)
  delay_segundos: number;
}

export class StartCampaignDto {
  @ApiProperty({ description: 'ID da campanha a iniciar' })
  @IsString()
  campanha_id: string;
}
