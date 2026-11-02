import { Injectable, Logger, Optional } from '@nestjs/common';
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
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private cachedReport: { data: HealthReport; expiresAt: number } | null = null;
  private readonly CACHE_TTL_MS = 5000;

  constructor(
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  async getHealth(force = false): Promise<HealthReport> {
    const now = Date.now();
    if (!force && this.cachedReport && this.cachedReport.expiresAt > now) {
      return {
        ...this.cachedReport.data,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    }

    let dbStatus: 'up' | 'down' | undefined = undefined;
    if (this.dataSource) {
      try {
        let timer: NodeJS.Timeout | undefined;
        const pingPromise = this.dataSource.query('SELECT 1');
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('DB timeout')), 2000);
        });
        try {
          await Promise.race([pingPromise, timeoutPromise]);
          dbStatus = 'up';
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch (err: unknown) {
        this.logger.warn(`Database health check failed: ${(err as Error).message}`);
        dbStatus = 'down';
      }
    }

    const report: HealthReport = {
      status: dbStatus === 'down' ? 'degraded' : 'ok',
      service: 'document-lib-microservice',
      app: 'Document Library Microservice',
      version: DOCUMENT_LIB_MICROSERVICE_VERSION,
      commitSha: GIT_COMMIT_SHA,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...(dbStatus ? { checks: { database: dbStatus } } : {}),
    };

    this.cachedReport = {
      data: report,
      expiresAt: now + this.CACHE_TTL_MS,
    };

    return report;
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
