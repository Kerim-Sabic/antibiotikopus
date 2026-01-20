import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { WinstonLoggerService } from './common/logger/winston-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Logger
  const logger = app.get(WinstonLoggerService);
  app.useLogger(logger);

  // Security
  app.use(helmet());

  // CORS
  const configService = app.get(ConfigService);
  const corsOrigin = configService.get('CORS_ORIGIN', 'http://localhost:3000').split(',');

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Prefix
  app.setGlobalPrefix('api');

  const port = configService.get('PORT', 3001);
  await app.listen(port);

  logger.log(`🚀 Horalix Backend API running on: http://localhost:${port}/api`);
}

bootstrap();
