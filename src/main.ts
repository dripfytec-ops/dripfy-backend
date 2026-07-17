import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const mediaDir = process.env.MEDIA_DIR || path.join(process.cwd(), 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  app.useStaticAssets(mediaDir, { prefix: '/media' });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Dripfy API rodando na porta ${port}`);
}

bootstrap().catch((err) => {
  console.error('FATAL BOOTSTRAP ERROR:', err);
  process.exit(1);
});
