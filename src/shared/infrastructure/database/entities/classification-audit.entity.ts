import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ENTITY } from '../models/general-model.js';
import DocumentEntity from './document.entity.js';
import RequirementEntity from './requirement.entity.js';
import ServiceEntity from './service-catalog.entity.js';
import TransactionEntity from './transaction.entity.js';

/**
 * Tracks AI document classification confidence, resolution methods,
 * and re-routing telemetry for analytics and observation.
 */
@Entity(ENTITY.CLASSIFICATION_AUDIT)
export default class ClassificationAuditEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'Id' })
  id!: string;

  @Column({ name: 'DocumentId', type: 'varchar', nullable: true })
  documentId?: string | null;

  @Column({ name: 'TransactionId', type: 'varchar', nullable: true })
  transactionId?: string | null;

  @Column({ name: 'ServiceId', type: 'varchar', nullable: true })
  serviceId?: string | null;

  @Column({ name: 'RequirementId', type: 'varchar', nullable: true })
  requirementId?: string | null;

  @Column({ name: 'RequirementName', type: 'varchar', length: 500, nullable: true })
  requirementName?: string | null;

  @Column({ name: 'Confidence', type: 'decimal', precision: 5, scale: 2, nullable: true })
  confidence?: number | null;

  @Column({ name: 'ConfidenceTier', type: 'varchar', length: 10, nullable: true })
  confidenceTier?: 'HIGH' | 'MEDIUM' | 'LOW' | null;

  @Column({ name: 'ResolutionMethod', type: 'varchar', length: 50, nullable: true })
  resolutionMethod?: string | null;

  @Column({ name: 'EvidenceCategory', type: 'varchar', length: 50, nullable: true })
  evidenceCategory?: string | null;

  @Column({ name: 'PreprocessingApplied', type: 'bit', nullable: false, default: false })
  preprocessingApplied!: boolean;

  @Column({ name: 'AiRawResponse', type: 'text', nullable: true })
  aiRawResponse?: string | null;

  @Column({ name: 'WasRerouted', type: 'bit', nullable: false, default: false })
  wasRerouted!: boolean;

  @Column({ name: 'RerouteReason', type: 'varchar', length: 500, nullable: true })
  rerouteReason?: string | null;

  @Column({ name: 'RequiresManualReview', type: 'bit', nullable: false, default: false })
  requiresManualReview!: boolean;

  @Column({ name: 'ProcessedAt', type: 'datetimeoffset', nullable: false })
  processedAt!: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = randomUUID().toUpperCase();
    }
    if (!this.processedAt) {
      this.processedAt = new Date();
    }
  }

  // Relationships
  @ManyToOne(() => DocumentEntity, {
    eager: false,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'DocumentId', referencedColumnName: 'id' })
  document?: DocumentEntity;

  @ManyToOne(() => TransactionEntity, {
    eager: false,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'TransactionId', referencedColumnName: 'id' })
  transaction?: TransactionEntity;

  @ManyToOne(() => ServiceEntity, {
    eager: false,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'ServiceId', referencedColumnName: 'id' })
  service?: ServiceEntity;

  @ManyToOne(() => RequirementEntity, {
    eager: false,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'RequirementId', referencedColumnName: 'id' })
  requirement?: RequirementEntity;
}
