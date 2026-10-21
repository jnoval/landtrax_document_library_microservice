import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CronManagementService } from './cron-management.service.js';
import { CronManagementController } from './cron-management.controller.js';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: 'ocr-reconciliation' })],
  controllers: [CronManagementController],
  providers: [CronManagementService],
  exports: [CronManagementService],
})
export class CronModule {}
