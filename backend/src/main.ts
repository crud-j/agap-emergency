import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const configService = app.get(ConfigService);

  // Security headers — disable CSP in dev so Swagger UI inline scripts are not blocked
  const isProd = configService.get('NODE_ENV') === 'production';
  app.use(helmet({ contentSecurityPolicy: isProd }));
  app.use(compression());

  // CORS
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3001');
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // API versioning
  app.enableVersioning({ type: VersioningType.URI });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global Prisma exception filter — maps DB errors to proper HTTP codes
  app.useGlobalFilters(new PrismaExceptionFilter());

  // WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Swagger/OpenAPI
  if (configService.get('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('AGAP Emergency Response API')
      .setDescription('AGAP — Emergency Response and Incident Coordination Platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('incidents', 'Incident management')
      .addTag('dispatch', 'Dispatch operations')
      .addTag('responders', 'Responder management')
      .addTag('hospitals', 'Hospital coordination')
      .addTag('announcements', 'Municipal announcements')
      .addTag('auth', 'Authentication')
      .addTag('users', 'User management')
      .addTag('analytics', 'Analytics and reporting')
      .addTag('alerts', 'Emergency alert triggering — SOS, shake, cancellation')
      .addTag('locations', 'GPS capture, reverse geocoding, live tracking')
      .addTag('resources', 'Fleet and resource management')
      .addTag('organizations', 'Organizations and member registry')
      .addTag('contacts', 'Emergency contacts')
      .addTag('medical', 'Medical profiles and consent')
      .addTag('notifications', 'Push and SMS notifications')
      .addTag('escalations', 'SLA monitoring and escalations')
      .addTag('audit', 'Immutable audit trail')
      .addTag('reports', 'Response analytics and reporting')
      .addTag('administration', 'System administration')
      .addTag('health', 'System health checks')
      .addTag('fleet', 'Vehicle registry')
      .addTag('facilities', 'Hospitals and evacuation centers')
      .addTag('risk', 'Risk intelligence and heatmaps')
      .addTag('surge', 'Disaster surge and mass-casualty mode')
      .addTag('communications', 'Secure incident messaging')
      .addTag('privacy', 'Data access log and export')
      .addTag('consent', 'Medical data consent management')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('BACKEND_PORT', 3000);
  const host = configService.get<string>('BACKEND_HOST', '0.0.0.0');
  await app.listen(port, host);

  console.warn(`AGAP Backend running on http://${host}:${port}`);
  if (configService.get('NODE_ENV') !== 'production') {
    console.warn(`Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
