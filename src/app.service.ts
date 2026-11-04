import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DOCUMENT_LIB_MICROSERVICE_VERSION, GIT_COMMIT_SHA } from './config/app-version.config.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  app: string;
  version: string;
  commitSha: string;
  timestamp: string;
  uptime: number;
  checks?: {
    database?: 'up' | 'down';
  };
}

@Injectable()
export class AppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppService.name);
  private dbStatus: 'up' | 'down' | undefined = undefined;
  private pollInterval?: NodeJS.Timeout;
  private isChecking = false;

  constructor(
    @Optional()
    private readonly dataSource?: DataSource,
  ) {
    if (this.dataSource) {
      this.dbStatus = 'up';
    }
  }

  onModuleInit(): void {
    if (this.dataSource) {
      // Immediate non-blocking background check
      void this.checkDatabaseAsync();
      // Periodic background check every 15 seconds
      this.pollInterval = setInterval(() => {
        void this.checkDatabaseAsync();
      }, 15000);
      this.pollInterval.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  async checkDatabaseAsync(): Promise<void> {
    if (!this.dataSource || this.isChecking) {
      return;
    }

    this.isChecking = true;
    try {
      if (!this.dataSource.isInitialized) {
        this.dbStatus = 'down';
        return;
      }

      let timer: NodeJS.Timeout | undefined;
      const pingPromise = this.dataSource.query('SELECT 1').catch((err) => {
        this.logger.debug?.(`Background DB ping failed: ${(err as Error).message}`);
        throw err;
      });

      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('DB timeout')), 2000);
      });

      try {
        await Promise.race([pingPromise, timeoutPromise]);
        this.dbStatus = 'up';
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (err: unknown) {
      this.logger.warn(`Database health check failed: ${(err as Error).message}`);
      this.dbStatus = 'down';
    } finally {
      this.isChecking = false;
    }
  }

  getHealth(): HealthReport {
    return {
      status: this.dbStatus === 'down' ? 'degraded' : 'ok',
      service: 'document-lib-microservice',
      app: 'Document Library Microservice',
      version: DOCUMENT_LIB_MICROSERVICE_VERSION,
      commitSha: GIT_COMMIT_SHA,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...(this.dbStatus ? { checks: { database: this.dbStatus } } : {}),
    };
  }

  getVersion() {
    return {
      service: 'document-lib-microservice',
      app: 'Document Library Microservice',
      version: DOCUMENT_LIB_MICROSERVICE_VERSION,
      commitSha: GIT_COMMIT_SHA,
      timestamp: new Date().toISOString(),
    };
  }
}
