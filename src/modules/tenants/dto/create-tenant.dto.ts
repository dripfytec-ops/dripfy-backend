import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'Loja do João' })
  @IsString()
  nome_empresa: string;

  @ApiProperty({ example: 'loja-do-joao' })
  @IsString()
  slug: string;

  @ApiPropertyOptional({ example: '12.345.678/0001-90' })
  @IsOptional()
  @IsString()
  cnpj?: string;

  @ApiPropertyOptional({ example: '(41) 99999-9999' })
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional({ example: 'João Silva' })
  @IsOptional()
  @IsString()
  nome_responsavel?: string;

  @ApiPropertyOptional({ example: 'contato@lojajoao.com' })
  @IsOptional()
  @IsEmail()
  email_contato?: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  admin_nome: string;

  @ApiProperty({ example: 'joao@lojajoao.com' })
  @IsEmail()
  admin_email: string;

  @ApiProperty({ example: 'Senha@123!' })
  @IsString()
  @MinLength(8)
  admin_password: string;
}

export class UpdateTenantStatusDto {
  @ApiProperty({ enum: ['ativo', 'inativo', 'trial'] })
  @IsString()
  status_assinatura: 'ativo' | 'inativo' | 'trial';
}

export class AtualizarDadosCadastraisDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nome_empresa?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cnpj?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nome_responsavel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email_contato?: string;
}
