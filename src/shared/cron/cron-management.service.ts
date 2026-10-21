import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface CronJobMetadata {
  lastExecution: Date | null;
  paused: boolean;
}

@Injectable()
export class CronManagementService {
  private readonly logger = new Logger(CronManagementService.name);

  /**
   * Upsert a repeatable job in the queue
   */
  async registerCronJob(queue: Queue, name: string, pattern: string): Promise<void> {
    const jobs = await queue.getJobSchedulers();
    const existing = jobs.find((j) => j.name === name);

    // If the cron expression changed, remove the old one
    if (existing && existing.pattern !== pattern) {
      await queue.removeJobScheduler(existing.key);
      this.logger.log(`Removed old repeatable job for ${name}`);
    }

    if (existing?.pattern !== pattern) {
      await queue.add(name, {}, { repeat: { pattern }, jobId: `${name}-cron` });
      this.logger.log(`Registered repeatable job ${name} with pattern ${pattern}`);
    } else {
      this.logger.log(`Repeatable job ${name} already registered with pattern ${pattern}`);
    }
  }

  /**
   * Pause a cron job manually
   */
  async pauseCronJob(queue: Queue, name: string): Promise<void> {
    const client = await queue.client;
    await client.hset('cron_metadata', { [`${name}:paused`]: 'true' });
    this.logger.log(`Paused cron job ${name}`);
  }

  /**
   * Resume a cron job manually
   */
  async resumeCronJob(queue: Queue, name: string): Promise<void> {
    const client = await queue.client;
    await client.hset('cron_metadata', { [`${name}:paused`]: 'false' });
    this.logger.log(`Resumed cron job ${name}`);
  }

  /**
   * Check if a cron job is paused
   */
  async isCronJobPaused(queue: Queue, name: string): Promise<boolean> {
    const client = await queue.client;
    const val = await client.hget('cron_metadata', `${name}:paused`);
    return val === 'true';
  }

  /**
   * Record the last execution time
   */
  async recordLastExecution(queue: Queue, name: string): Promise<void> {
    const client = await queue.client;
    await client.hset('cron_metadata', { [`${name}:lastExecution`]: new Date().toISOString() });
  }

  /**
   * Get cron job metadata (last execution, paused state)
   */
  async getCronMetadata(queue: Queue, name: string): Promise<CronJobMetadata> {
    const client = await queue.client;
    const [lastExecution, paused] = await client.hmget(
      'cron_metadata',
      `${name}:lastExecution`,
      `${name}:paused`,
    );
    return {
      lastExecution: lastExecution ? new Date(lastExecution) : null,
      paused: paused === 'true',
    };
  }
}
