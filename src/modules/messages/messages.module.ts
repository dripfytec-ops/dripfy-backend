import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MediaModule } from '../../common/media/media.module';
import { DisparoMassaModule } from '../disparo-massa/disparo-massa.module';

@Module({
  imports: [MediaModule, DisparoMassaModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
