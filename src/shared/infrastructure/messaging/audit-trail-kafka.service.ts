import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Kafka, Producer } from 'kafkajs';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { KAFKA_TOPICS } from '../../common/kafka.constants.js';
import { AuditTrailStatus } from '../../common/status.js';
import { AuditTrailService } from '../../contracts/audit-trail.service.abstract.js';
import AuditTrailEntity from '../database/entities/audit-trail.entity.js';
/**
 * Event-driven audit trail service using Kafka.
 * Emits audit events to Kafka topic 'audit-trail.log' with an automatic
 * direct database fallback if Kafka broker is unavailable.
 */
@Injectable()
export class AuditTrailKafkaService
  extends AuditTrailService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AuditTrailKafkaService.name);
  private kafkaProducer?: Producer;
  private isProducerConnected = false;

  constructor(
    @InjectRepository(AuditTrailEntity)
    private readonly auditTrailRepo: Repository<AuditTrailEntity>,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const isKafkaEnabled = process.env.KAFKA_ENABLED !== 'false';
    if (!isKafkaEnabled) {
      this.logger.log('Kafka is disabled. Audit logs will be written directly to the database.');
      return;
    }

    try {
      const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092')
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean);

      const kafka = new Kafka({
        clientId: process.env.KAFKA_CLIENT_ID || 'document-intelligence-audit',
        brokers,
        retry: {
          retries: 5,
          initialRetryTime: 300,
          maxRetryTime: 3000,
        },
      });

      this.kafkaProducer = kafka.producer({
        allowAutoTopicCreation: true,
      });

      await this.kafkaProducer.connect();
      this.isProducerConnected = true;
      this.logger.log('Kafka Audit Trail Producer connected successfully');
    } catch (error: unknown) {
      this.isProducerConnected = false;
      this.logger.warn(
        `Failed to connect Kafka Audit Producer on startup: ${(error as Error)?.message}. Direct DB fallback will be used.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.kafkaProducer && this.isProducerConnected) {
      try {
        await this.kafkaProducer.disconnect();
      } catch (error: unknown) {
        this.logger.warn(`Error disconnecting Kafka producer: ${(error as Error)?.message}`);
      }
    }
  }

  getUserAuditTrail(_userId: string, ..._args: any[]): Promise<any> {
    throw new Error('Method not implemented.');
  }

  async create(dto: {
    userId?: string;
    action: string;
    entity?: string;
    details?: string;
    result?: string;
    ip?: string;
  }): Promise<any> {
    const normalizedUserId =
      !dto.userId || String(dto.userId).toLowerCase() === 'system'
        ? null
        : dto.userId;

    const auditRecord = {
      id: randomUUID().toUpperCase(),
      userId: normalizedUserId,
      action: dto.action,
      resource: dto.entity || 'OCR',
      area: 'Document Intelligence',
      details: dto.details || null,
      status: (dto.result as AuditTrailStatus) || AuditTrailStatus.SUCCESS,
      ipAddress: dto.ip || '127.0.0.1',
      timestamp: new Date(),
    };

    // 1. Primary path: Emit to Kafka
    if (this.isProducerConnected && this.kafkaProducer) {
      try {
        await this.kafkaProducer.send({
          topic: KAFKA_TOPICS.AUDIT_TRAIL_LOG,
          messages: [
            {
              key: dto.userId || 'system',
              value: JSON.stringify(auditRecord),
            },
          ],
        });
        this.logger.debug(
          `Audit event dispatched to Kafka [${KAFKA_TOPICS.AUDIT_TRAIL_LOG}] for action=${dto.action}`,
        );
        return { success: true, transport: 'kafka' };
      } catch (error: unknown) {
        this.logger.warn(
          `Kafka dispatch failed for audit action=${dto.action}: ${(error as Error)?.message}. Falling back to DB repository.`,
        );
      }
    }

    // 2. Fallback path: Direct DB insertion
    try {
      const entity = this.auditTrailRepo.create(auditRecord);
      await this.auditTrailRepo.save(entity);
      this.logger.debug(`Audit event saved directly to DB for action=${dto.action}`);
      return { success: true, transport: 'database' };
    } catch (dbError: unknown) {
      this.logger.error(
        `Failed to save audit trail to DB fallback (action=${dto.action}): ${(dbError as Error)?.message}`,
        (dbError as Error)?.stack,
      );
      return { success: false, error: (dbError as Error)?.message };
    }
  }
}
