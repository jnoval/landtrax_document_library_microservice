import { AfterLoad, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { formatToUserDate } from '../../../../utils/date-utils.js';
import { Entities } from '../models/general.model.js';
import { LineEntity } from './general.entity.js';
import RequirementEntity from './requirement.entity.js';
import TransactionServiceEntity from './transaction-service.entity.js';
import TransactionEntity from './transaction.entity.js';
import UserEntity from './user.entity.js';
import ExtractedFieldEntity from './extracted-field.entity.js';
import DocumentTagEntity from './document-tag.entity.js';
import RecipientDocumentsEntity from './recipient-documents.entity.js';

@Entity(Entities.DOCUMENT)
export default class DocumentEntity extends LineEntity {
  @Column({ name: 'FileURL', type: 'nvarchar', nullable: false })
  fileURL!: string;

  @Column({ name: 'Category', type: 'varchar', length: 255, nullable: false })
  category!: string;

  @Column({ name: 'UserId', type: 'varchar', nullable: false })
  userId!: string; // FK to user, who uploads the document

  @Column({ name: 'FileSize', type: 'bigint', nullable: false })
  fileSize!: number;

  @Index('IX_Document_ContentHash')
  @Column({ name: 'ContentHash', type: 'varchar', length: 64, nullable: true })
  contentHash?: string | null;

  @Column({ name: 'OriginalFileName', type: 'nvarchar', nullable: true })
  originalFileName?: string;

  @Column({ name: 'TransactionId', type: 'varchar', nullable: true })
  transactionId!: string; // parent transaction, fk to transaction

  @Column({ name: 'TransactionServiceId', type: 'varchar', nullable: true }) // FileCategory
  transactionServiceId?: string | null; // child transaction, fk to transaction service

  @Column({ name: 'RequirementId', type: 'varchar', nullable: true }) // FileCategory
  requirementId?: string | null; // child requirement, fk to requirement

  @Column({ name: 'ParentDocumentId', type: 'varchar', nullable: true })
  parentDocumentId?: string | null;

  @Column({ name: 'Type', type: 'varchar', length: 255, nullable: false }) // FileType
  type!: string;

  @Column({ name: 'Notes', type: 'text', nullable: true })
  notes?: string | null;

  // Mark select: false to avoid selecting from databases that have not yet added the column.
  // Once the column exists in the DB, remove select:false if full projection is needed.
  @Column({ name: 'Version', type: 'int', nullable: true, default: 1, select: false })
  version?: number;

  @Column({ name: 'IsOCR', type: 'bit', nullable: false, default: false })
  isOCR!: boolean;

  @Column({ name: 'OCRProcessed', type: 'bit', nullable: false })
  ocrProcessed!: boolean;

  @Column({ name: 'OCRText', type: 'varchar', length: 255, nullable: false })
  ocrText!: string;

  @Column({ name: 'OCRConfidence', type: 'decimal', precision: 5, scale: 2, nullable: false })
  ocrConfidence!: number;

  @Column({ name: 'OCRProcessFailedReason', type: 'nvarchar', nullable: true })
  ocrProcessFailedReason!: string | null;

  @Column({ name: 'OCRProcessedDate', type: 'datetime', nullable: false })
  ocrProcessedDate!: Date;

  @Column({ name: 'ClassificationConfidence', type: 'decimal', precision: 5, scale: 2, nullable: true })
  classificationConfidence?: number | null;

  @Column({ name: 'ClassificationTier', type: 'varchar', length: 10, nullable: true })
  classificationTier?: 'HIGH' | 'MEDIUM' | 'LOW' | null;

  @Column({ name: 'ClassificationReviewStatus', type: 'varchar', length: 30, nullable: true })
  classificationReviewStatus?: 'AUTO_ACCEPTED' | 'MANUAL_REVIEW' | 'UNREADABLE' | 'PINNED' | null;

  @Column({ name: 'ClassificationReviewReason', type: 'nvarchar', nullable: true })
  classificationReviewReason?: string | null;

  // DOCUMENT RELATIONSHIPS
  @ManyToOne(() => TransactionEntity, (transaction) => transaction.documents, {
    eager: false,
  })
  @JoinColumn({ name: 'TransactionId', referencedColumnName: 'id' })
  transaction!: TransactionEntity;

  @ManyToOne(() => TransactionServiceEntity, (transactionService) => transactionService.documents, {
    eager: false,
  })
  @JoinColumn({ name: 'TransactionServiceId', referencedColumnName: 'id' })
  transactionService?: TransactionServiceEntity;

  @ManyToOne(() => UserEntity, (user) => user.documents, {
    eager: false,
  })
  @JoinColumn({ name: 'UserId', referencedColumnName: 'id' })
  user?: UserEntity;

  @ManyToOne(() => RequirementEntity, (requirement) => requirement.documents, {
    eager: false,
  })
  @JoinColumn({ name: 'RequirementId', referencedColumnName: 'id' })
  requirement?: RequirementEntity;

  @OneToMany(() => DocumentTagEntity, (documentTag) => documentTag.document, {
    eager: false,
    cascade: ['insert', 'update'],
  })
  documentTags?: DocumentTagEntity[];

  @OneToMany(() => RecipientDocumentsEntity, (rd) => rd.document, {
    eager: false,
    cascade: true,
  })
  recipientDocuments?: RecipientDocumentsEntity[];

  @ManyToOne(() => UserEntity, (user) => user.createdDocuments, {
    eager: false,
  })
  @JoinColumn({ name: 'CreatedBy', referencedColumnName: 'id' })
  createdByUser?: UserEntity;

  @ManyToOne(() => DocumentEntity, (doc) => doc.childDocuments, {
    eager: false,
  })
  @JoinColumn({ name: 'ParentDocumentId', referencedColumnName: 'id' })
  parentDocument?: DocumentEntity;

  @OneToMany(() => DocumentEntity, (doc) => doc.parentDocument, {
    eager: false,
  })
  childDocuments?: DocumentEntity[];

  @OneToMany(() => ExtractedFieldEntity, (extractedFields) => extractedFields.document, {
    eager: false,
    cascade: ['insert', 'update', 'remove'],
  })
  extractedFields?: ExtractedFieldEntity[];

  // Virtual properties
  tags?: DocumentTagEntity[];
  isAllExtractedFieldsFilled?: boolean;
  convertedCreatedDate?: string;
  thumbnailUrl?: string | null;
  uploader?: UserEntity;
  publicUrl?: string;

  @AfterLoad()
  onLoad() {
    this.checkAllExtractedFieldsFilled();
    this.setConvertedCreatedDate();
  }

  setConvertedCreatedDate() {
    this.convertedCreatedDate = formatToUserDate(this.createdDate);
  }

  checkAllExtractedFieldsFilled() {
    if (this.extractedFields && this.extractedFields.length > 0) {
      this.isAllExtractedFieldsFilled =
        this.extractedFields.length > 0 &&
        this.extractedFields.every((field) => !!field.value?.trim());
    } else {
      this.isAllExtractedFieldsFilled = true;
    }
  }
}
