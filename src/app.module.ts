import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { getTypeOrmConfig } from './config/app.config.js';
import awsConfig from './config/aws.config.js';
import redisConfig from './config/redis.config.js';
import { DocumentModule } from './domains/document/document.module.js';
import { S3StorageModule } from './domains/s3-storage/s3-storage.module.js';
import { TagModule } from './domains/tag/tag.module.js';
import { CronModule } from './shared/cron/cron.module.js';
import { InternalHttpModule } from './shared/infrastructure/http/internal-http.module.js';
import { AuditTrailInterceptor } from './shared/logging/audit-trail.interceptor.js';

@Module({
  imports: [
    CronModule,
    ConfigModule.forRoot({
      envFilePath: ['.env'],
      isGlobal: true,
      load: [redisConfig, awsConfig],
    }),

    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => getTypeOrmConfig(configService),
      inject: [ConfigService],
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const isCluster = configService.get<boolean>('redis.cluster', false);
        const useTls = configService.get<boolean>('redis.tls', false);
        const rejectUnauthorized = configService.get<boolean>('redis.tlsRejectUnauthorized', true);

        return {
          connection: {
            host: configService.get<string>('redis.host'),
            port: configService.get<number>('redis.port'),
            password: configService.get<string>('redis.password'),
            ...(isCluster
              ? { clusterRetryStrategy: (times: number) => Math.min(times * 50, 2000) }
              : {}),
            ...(useTls ? { tls: { rejectUnauthorized } } : {}),
          },
        };
      },
      inject: [ConfigService],
    }),

    S3StorageModule,
    TagModule,
    DocumentModule,
    InternalHttpModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditTrailInterceptor,
    },
  ],
})
export class AppModule {}
