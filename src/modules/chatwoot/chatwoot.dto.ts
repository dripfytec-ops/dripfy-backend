import { IsString } from 'class-validator';

export class SaveChatwootConfigDto {
  @IsString()
  chatwoot_url: string;

  @IsString()
  chatwoot_api_token: string;
}
