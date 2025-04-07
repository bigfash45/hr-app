import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Keeps the same base path the Angular client already targets, so switching
  // backends is a host change rather than a rewrite of every service.
  const prefix = config.get<string>('API_PREFIX', 'hr/api/v1');
  app.setGlobalPrefix(prefix);

  app.use(helmet());
  app.use(cookieParser());

  // credentials: true is required for the httpOnly refresh cookie to travel.
  // That in turn forbids a wildcard origin, so origins are listed explicitly.
  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGINS', 'http://localhost:4200')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean),
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject unknown properties outright rather than silently dropping them —
      // a typo'd field name should fail loudly, not vanish.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  app.enableShutdownHooks();

  // OpenAPI, generated from the code. The previous backend's /v3/api-docs
  // returned 500, which left the frontend with no contract to build against —
  // this one is a release gate, not a nicety.
  const openApi = new DocumentBuilder()
    .setTitle('NowNowHR API')
    .setDescription('Internal multi-tenant HRMS for NowNow Digital Systems and sister companies')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, openApi));

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);

  logger.log(`NowNowHR API listening on http://localhost:${port}/${prefix}`);
  logger.log(`OpenAPI at http://localhost:${port}/${prefix}/docs`);
}

void bootstrap();
