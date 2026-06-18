import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'Loja do João' })
  @IsString()
  nome_empresa: string;

  @ApiProperty({ example: 'loja-do-joao' })
  @IsString()
  slug: string;

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
