import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Param, Post } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CronManagementService } from './cron-management.service.js';

@Controller('ocr/cron-jobs')
export class CronManagementController {
  constructor(
    @InjectQueue('ocr-reconciliation') private readonly ocrQueue: Queue,
    private readonly cronManagementService: CronManagementService,
  ) {}

  @Get()
  async getCronJobs() {
    const meta = await this.cronManagementService.getCronMetadata(
      this.ocrQueue,
      'ocr-reconciliation',
    );
    const jobs = await this.ocrQueue.getJobSchedulers();
    const job = jobs.find((j) => j.name === 'ocr-reconciliation');

    return [
      {
        name: 'ocr-reconciliation',
        cron: job?.pattern || '*/1 * * * *',
        timezone: 'UTC',
        job: 'OCR Reconciliation',
        lastExecution: meta.lastExecution,
        nextExecution: job ? new Date(`${job.next ?? ''}`) : null,
        isPaused: meta.paused,
      },
    ];
  }

  @Post(':id/trigger')
  async triggerCronJob(@Param('id') id: string) {
    if (id === 'ocr-reconciliation') {
      await this.ocrQueue.add('ocr-reconciliation', {});
      return { success: true };
    }
    return { success: false };
  }

  @Post(':id/pause')
  async pauseCronJob(@Param('id') id: string) {
    if (id === 'ocr-reconciliation') {
      await this.cronManagementService.pauseCronJob(this.ocrQueue, id);
      return { success: true };
    }
    return { success: false };
  }

  @Post(':id/resume')
  async resumeCronJob(@Param('id') id: string) {
    if (id === 'ocr-reconciliation') {
      await this.cronManagementService.resumeCronJob(this.ocrQueue, id);
      return { success: true };
    }
    return { success: false };
  }
}
