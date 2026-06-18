import { Module } from '@nestjs/common';
import { ChatwootController } from './chatwoot.controller';
import { ChatwootService } from './chatwoot.service';

@Module({
  controllers: [ChatwootController],
  providers: [ChatwootService],
  exports: [ChatwootService],
})
export class ChatwootModule {}
