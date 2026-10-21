import { CommonResponse } from '../../shared/common/response.js';
import { CustomMeta } from '../../shared/common/meta.js';
import DocumentEntity from '../../shared/infrastructure/database/entities/document.entity.js';
import { CreateDocumentDto } from './dtos/create-document.dto.js';
import { CreateDocumentDtoV2 } from './dtos/create-document-v2.dto.js';
import { UpdateDocumentDto } from './dtos/update-document.dto.js';
import { UpdateOCRFieldDto } from './dtos/update-ocr-field.dto.js';
import { TransactionView } from './services/document-service-v2/get-tree-view.js';

export abstract class DocumentServiceV2 {
  abstract create(userId: string, data: CreateDocumentDtoV2): Promise<CommonResponse>;
  abstract getUploadedBy(
    userId: string,
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ data: { id: string; name: string }[]; meta: CustomMeta }>;
  abstract updateOCRField(
    documentId: string,
    userId: string,
    data: UpdateOCRFieldDto,
  ): Promise<CommonResponse>;
  abstract getDocumentByRequirement(
    requirementId: string,
    transactionServiceId: string,
  ): Promise<DocumentEntity[]>;
  abstract getDocument(documentId: string): Promise<DocumentEntity>;
  abstract getOrConvertDocxToPdf(originalKey: string): Promise<string>;
  abstract downloadAllDocumentsByTransactionService(
    transactionServiceId: string,
    res: any,
  ): Promise<void>;
  abstract downloadAllDocumentsByTransaction(transactionId: string, res: any): Promise<void>;
  abstract getTreeView(
    userId: string,
    page?: number,
    limit?: number,
    search?: string,
  ): Promise<{ data: TransactionView[]; meta: CustomMeta }>;
}

export interface DocumentListFilter {
  page?: number;
  limit?: number;
  search?: string;
  types?: string[];
  transactionNumber?: string;
  entityCode?: string;
  uploadedBy?: string[];
  fromDate?: string;
  toDate?: string;
  sortBy: string;
  sortDirection: string;
  userId?: string;
  userType?: string;
}

export abstract class DocumentService {
  abstract create(createDocumentDto: CreateDocumentDto): Promise<DocumentEntity>;
  abstract findAll(
    page: number,
    limit: number,
    search?: string,
    userId?: string,
    sortBy?: string,
    sortDirection?: string,
  ): Promise<{
    data: DocumentEntity[];
    meta: CustomMeta;
  }>;
  abstract findOne(documentId: string): Promise<DocumentEntity>;
  abstract update(id: string, updateDocumentDto: UpdateDocumentDto): Promise<DocumentEntity>;
  abstract softDelete(id: string): Promise<{ message: string; deletedId: string }>;
  abstract getDocument(
    userId: string,
    transactionId: string,
    requirementId: string,
    documentId: string,
  ): Promise<{ filePath: string; filename: string; mimeType: string }>;

  // Tree View Methods
  abstract getTreeView(
    filters?: DocumentListFilter,
    userId?: string,
  ): Promise<{
    data: DocumentEntity[];
    meta: CustomMeta;
  }>;

  abstract debugTransactionLookup(transactionNumber: string): Promise<any>;
  abstract getParentTransactionDetails(parentTransactionNumber: string): Promise<any>;
  abstract getChildTransactionDetails(
    parentTransactionNumber: string,
    childTransactionNumber: string,
  ): Promise<any>;
  abstract getRequirementDocuments(
    parentTransactionNumber: string,
    childTransactionNumber: string,
    requirementCode: string,
    filters?: {
      query?: string;
      documentTypes?: string[];
      uploadedAfter?: string;
      uploadedBefore?: string;
    },
  ): Promise<any>;

  // List View Method
  abstract getListView(
    filters?: DocumentListFilter,
    userId?: string,
  ): Promise<{
    data: DocumentEntity[];
    meta: CustomMeta;
  }>;

  // Tags Methods
  abstract getTags(): Promise<{ tags: any[] }>;
  abstract createTag(
    body: { name: string; color?: string; description?: string },
    userId: string,
  ): Promise<any>;
  abstract updateTag(body: {
    id: string;
    name?: string;
    color?: string;
    description?: string;
  }): Promise<any>;
  abstract deleteTag(id: string): Promise<{ success: boolean }>;

  // Document-Tag Association Methods
  abstract addTagToDocument(
    documentId: string,
    tagId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }>;
  abstract removeTagFromDocument(
    documentId: string,
    tagId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }>;
  abstract bulkAddTags(
    documentIds: string[],
    tagIds: string[],
    userId: string,
  ): Promise<{ success: boolean; documentsUpdated: number; tagsAdded: number }>;
  abstract getDocumentTags(documentId: string): Promise<{ tags: any[] }>;

  // Document Category Methods
  abstract getRequirementDocumentsByService(
    transactionServiceId: string,
  ): Promise<{ requirements: any[] }>;
  abstract getSupportingDocumentsByService(transactionServiceId: string): Promise<DocumentEntity[]>;
  abstract getOutputDocumentsByService(transactionServiceId: string): Promise<DocumentEntity[]>;
  abstract getEOSDocumentsByTransaction(transactionId: string): Promise<DocumentEntity[]>;
  abstract getReceiptDocumentsByTransaction(transactionId: string): Promise<DocumentEntity[]>;
  abstract getRecipientIdDocumentsByTransaction(transactionId: string): Promise<DocumentEntity[]>;
}
