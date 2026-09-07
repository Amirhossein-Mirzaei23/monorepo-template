import 'reflect-metadata';
import './instrumentation'; // must be imported before any instrumented module
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { requireAppConfig } from './config/configuration';
import { createGlobalValidationPipe } from './common/pipes/validation.pipe';
import { WsAdapter } from './common/ws/ws-adapter';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = requireAppConfig(app.get(ConfigService));
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.flushLogs();

  // --- Global hardening (doc/ARCHITECTURE.md → Security) ---
  app.use(
    helmet({
      // The swagger UI at /docs needs inline scripts; in production the UI is disabled.
      contentSecurityPolicy: config.environment === 'production',
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      // Same-origin/curl requests carry no Origin header and are allowed.
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });
  app.useGlobalPipes(createGlobalValidationPipe());
  // CHT-004 — the /ws socket.io gateway rides the same HTTP server; its
  // handshake CORS comes from app.ws.origins (credentials on) via this
  // adapter. REST CORS above is unchanged (corsOrigins).
  app.useWebSocketAdapter(new WsAdapter(app, app.get(ConfigService)));
  app.enableShutdownHooks();

  // --- Swagger (contract source of truth for packages/shared-types) ---
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.port, '0.0.0.0');

  const url = await app.getUrl();
  NestLogger.log(`API ready at ${url} (swagger: ${url}/docs)`, 'Bootstrap');
}

void bootstrap();
