import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import configuration, { requireAppConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { LotsModule } from './modules/lots/lots.module';
import { OtpModule } from './modules/otp/otp.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { UsersModule } from './modules/users/users.module';
import { SmsModule } from './modules/sms/sms.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = requireAppConfig(configService);
        return {
          pinoHttp: {
            level: config.environment === 'production' ? 'info' : 'debug',
            genReqId: (req, res) => {
              const header = req.headers['x-request-id'];
              const id = typeof header === 'string' && header.length > 0 ? header : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie'],
              censor: '[redacted]',
            },
            autoLogging: {
              ignore: (req) => req.url === '/metrics' || (req.url?.startsWith('/health') ?? false),
            },
            customProps: () => ({ context: 'HTTP' }),
            transport:
              config.environment === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = requireAppConfig(configService);
        return [{ ttl: config.throttle.ttlMs, limit: config.throttle.limit }];
      },
    }),
    PrismaModule,
    // Cron registry for modules/jobs (LOT-006 hourly lot expiry sweep).
    ScheduleModule.forRoot(),
    MetricsModule,
    HealthModule,
    UsersModule,
    AuthModule,
    SmsModule,
    OtpModule,
    CategoriesModule,
    ProfilesModule,
    LotsModule,
    JobsModule,
  ],
  providers: [
    // Guard order: rate limit → authenticate → authorize
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
