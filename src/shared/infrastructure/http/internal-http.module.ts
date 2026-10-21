import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditTrailService } from '../../contracts/audit-trail.service.abstract.js';
import { EmailService } from '../../contracts/email.service.abstract.js';
import AuditTrailEntity from '../database/entities/audit-trail.entity.js';
import { AuditTrailKafkaService } from '../messaging/audit-trail-kafka.service.js';
import { EmailHttpClient } from './email-http.client.js';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
    TypeOrmModule.forFeature([AuditTrailEntity]),
  ],
  providers: [
    { provide: EmailService, useClass: EmailHttpClient },
    { provide: AuditTrailService, useClass: AuditTrailKafkaService },
  ],
  exports: [EmailService, AuditTrailService],
})
export class InternalHttpModule {}
