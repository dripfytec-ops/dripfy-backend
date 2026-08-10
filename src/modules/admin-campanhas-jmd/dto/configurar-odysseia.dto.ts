import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfigurarOdysseiaDto {
  @ApiProperty() @IsString() template_id: string;
  @ApiProperty() @IsString() receptive_fonte: string;
  // Opcional: sobrescreve o agendamento já existente na demanda (a Odysseia
  // exige data + horário pra toda demanda enviada por ela).
  @ApiPropertyOptional() @IsOptional() @IsDateString() agendado_para?: string;
}
