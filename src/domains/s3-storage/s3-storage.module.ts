import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import SystemSettingEntity from '../../shared/infrastructure/database/entities/system-setting.entity.js';
import { S3StorageController } from './controllers/s3-storage.controller.js';
import {
  StreamingS3DocumentFileInterceptor,
  StreamingS3OcrFilesInterceptor,
} from './interceptors/streaming-s3-upload.interceptor.js';
import { S3StorageService } from './services/s3-storage.service.js';
import { S3StreamingStorageEngine } from './services/s3-streaming-storage.engine.js';
import { StorageService } from './types.js';

@Global()
@Module({
  imports: [
    ConfigModule,
    ThrottlerModule,
    TypeOrmModule.forFeature([SystemSettingEntity]),
  ],
  controllers: [S3StorageController],
  providers: [
    S3StorageService,
    {
      provide: StorageService,
      useExisting: S3StorageService,
    },
    StreamingS3DocumentFileInterceptor,
    StreamingS3OcrFilesInterceptor,
  ],
  exports: [
    S3StorageService,
    StorageService,
    StreamingS3DocumentFileInterceptor,
    StreamingS3OcrFilesInterceptor,
  ],
})
export class S3StorageModule {}
export default S3StorageModule;
