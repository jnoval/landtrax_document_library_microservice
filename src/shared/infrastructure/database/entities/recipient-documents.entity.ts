import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ENTITY } from '../models/general-model.js';
import DocumentEntity from './document.entity.js';
import { LineEntity } from './general.entity.js';
import RecipientEntity from './recipient.entity.js';

@Entity(ENTITY.RECIPIENT_DOCUMENTS)
export default class RecipientDocumentsEntity extends LineEntity {
  @Column({ name: 'RecipientId', type: 'varchar', nullable: false })
  recipientId!: string;

  @Column({ name: 'DocumentId', type: 'varchar', nullable: false })
  documentId!: string;

  @ManyToOne(() => RecipientEntity, (recipient) => recipient.recipientDocuments, {
    eager: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'RecipientId', referencedColumnName: 'id' })
  recipient!: RecipientEntity;

  @ManyToOne(() => DocumentEntity, (document) => document.recipientDocuments, {
    eager: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'DocumentId', referencedColumnName: 'id' })
  document!: DocumentEntity;
}
