import { Module } from '@nestjs/common';
import { BmTokensService } from './bm-tokens.service';
import { BmTokensController } from './bm-tokens.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BmTokensController],
  providers: [BmTokensService],
})
export class BmTokensModule {}
