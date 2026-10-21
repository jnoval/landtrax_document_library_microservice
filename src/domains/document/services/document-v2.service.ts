import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomUUID as uuidv4 } from 'node:crypto';
import { CustomMeta } from '../../../shared/common/meta.js';
import { CommonResponse } from '../../../shared/common/response.js';
import DocumentTagEntity from '../../../shared/infrastructure/database/entities/document-tag.entity.js';
import DocumentEntity from '../../../shared/infrastructure/database/entities/document.entity.js';
import RequirementEntity from '../../../shared/infrastructure/database/entities/requirement.entity.js';
import TagEntity from '../../../shared/infrastructure/database/entities/tag.entity.js';
import TransactionServiceEntity from '../../../shared/infrastructure/database/entities/transaction-service.entity.js';
import TransactionEntity from '../../../shared/infrastructure/database/entities/transaction.entity.js';
import UserEntity from '../../../shared/infrastructure/database/entities/user.entity.js';
import { Semaphore } from '../../../utils/concurrency.js';
import { convertDocxToPdfFile } from '../../../utils/docx-to-pdf.js';
import { S3StorageService } from '../../s3-storage/services/s3-storage.service.js';
import { CreateDocumentDtoV2 } from '../dtos/create-document-v2.dto.js';
import { UpdateOCRFieldDto } from '../dtos/update-ocr-field.dto.js';
import { DocumentServiceV2 } from '../types.js';
import { CompanyScopeHelper } from './company-scope.helper.js';
import CreateDocumentV2 from './document-service-v2/create-document.js';
import DownloadAllDocumentsByTransactionV2 from './document-service-v2/download-all-documents-by-transaction.js';
import DownloadAllDocumentsByTransactionServiceV2 from './document-service-v2/download-all-documents-by-transaction-service.js';
import GetTreeView, { TransactionView } from './document-service-v2/get-tree-view.js';
import { GetUploadedBy } from './document-service-v2/get-uploaded-by.js';
import UpdateOCRField from './document-service-v2/update-ocr-field.js';

@Injectable()
export class DocumentServiceImplV2 extends DocumentServiceV2 {
  private readonly _logger = new Logger(DocumentServiceImplV2.name);
  private readonly _conversionSemaphore = new Semaphore(2);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly _documentRepo: Repository<DocumentEntity>,
    @InjectRepository(UserEntity)
    private readonly _userRepo: Repository<UserEntity>,
    @InjectRepository(TransactionEntity)
    private readonly _transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(RequirementEntity)
    private readonly _requirementRepo: Repository<RequirementEntity>,
    @InjectRepository(TagEntity)
    private readonly _tagRepo: Repository<TagEntity>,
    @InjectRepository(DocumentTagEntity)
    private readonly _documentTagRepo: Repository<DocumentTagEntity>,
    @InjectRepository(TransactionServiceEntity)
    private readonly _transactionServiceRepo: Repository<TransactionServiceEntity>,
    private readonly _s3StorageService: S3StorageService,
    private readonly _companyScopeHelper: CompanyScopeHelper,
  ) {
    super();
  }

  async create(userId: string, data: CreateDocumentDtoV2): Promise<CommonResponse> {
    return CreateDocumentV2({
      userId,
      data,
      userRepo: this._userRepo,
      documentRepo: this._documentRepo,
    });
  }

  async updateOCRField(
    documentId: string,
    userId: string,
    data: UpdateOCRFieldDto,
  ): Promise<CommonResponse> {
    return UpdateOCRField({
      documentId,
      userId,
      data,
      documentRepo: this._documentRepo,
      userRepo: this._userRepo,
    });
  }

  async getUploadedBy(
    userId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ): Promise<{ data: { id: string; name: string }[]; meta: CustomMeta }> {
    return GetUploadedBy({
      userId,
      page,
      limit,
      search,
      documentRepo: this._documentRepo,
      userRepo: this._userRepo,
      companyScopeHelper: this._companyScopeHelper,
    });
  }

  async getDocumentByRequirement(
    requirementId: string,
    transactionServiceId: string,
  ): Promise<DocumentEntity[]> {
    const documents = await this._documentRepo.find({
      where: {
        requirementId,
        transactionServiceId,
        deletedDate: IsNull(),
      },
    });
    return documents;
  }

  async getDocument(documentId: string): Promise<DocumentEntity> {
    const document = await this._documentRepo.findOne({
      where: { id: documentId, deletedDate: IsNull() },
      withDeleted: false,
      relations: [
        'user',
        'user.userCompanies',
        'user.userCompanies.company',
        'transactionService',
        'transactionService.service',
        'transaction',
        'requirement',
        'extractedFields',
      ],
    });
    if (!document) throw new NotFoundException('Document not found');

    const thumbnailUrl = await this._s3StorageService.getSignedUrl(document.fileURL);
    (document as any).thumbnailUrl = thumbnailUrl || null;
    (document as any).uploader = {
      name: `${document.user?.firstName || ''} ${document.user?.lastName || ''}`.trim(),
      email: document?.user?.email || '',
      username: (document?.user as any)?.username || '',
    };
    delete (document as any).user;
    return document;
  }

  async getOrConvertDocxToPdf(originalKey: string): Promise<string> {
    const pdfKey = originalKey.replace(/\.docx$/i, '.pdf');

    try {
      const exists = await this._s3StorageService.fileExists(pdfKey);
      if (exists) {
        this._logger.log(`Using cached PDF for: ${originalKey}`);
        return pdfKey;
      }

      this._logger.log(`Converting DOCX to PDF (queued): ${originalKey}`);

      return await this._conversionSemaphore.run(async () => {
        const tempId = uuidv4();
        const tempDocxPath = path.join(os.tmpdir(), `${tempId}.docx`);
        const tempPdfPath = path.join(os.tmpdir(), `${tempId}.pdf`);

        try {
          this._logger.log(`Downloading DOCX to temp file: ${originalKey}`);
          await this._s3StorageService.downloadToFile(originalKey, tempDocxPath);

          this._logger.log(`Converting DOCX to PDF on disk: ${tempDocxPath}`);
          await convertDocxToPdfFile(tempDocxPath, os.tmpdir());

          this._logger.log(`Uploading converted PDF to S3: ${pdfKey}`);
          const readStream = fs.createReadStream(tempPdfPath);
          await this._s3StorageService.uploadStream({
            stream: readStream,
            folder: pdfKey.split('/').slice(0, -1).join('/'),
            fileName: pdfKey.split('/').pop() || 'document.pdf',
            mimeType: 'application/pdf',
          });

          return pdfKey;
        } finally {
          try {
            if (fs.existsSync(tempDocxPath)) fs.unlinkSync(tempDocxPath);
            if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
          } catch (cleanupError) {
            this._logger.warn(`Failed to cleanup temp files: ${cleanupError}`);
          }
        }
      });
    } catch (error: unknown) {
      this._logger.error(
        `Error in getOrConvertDocxToPdf for ${originalKey}: ${(error as Error).message}`,
      );
      return originalKey;
    }
  }

  async downloadAllDocumentsByTransactionService(transactionId: string, res: any): Promise<void> {
    return DownloadAllDocumentsByTransactionServiceV2({
      transactionId,
      transactionRepo: this._transactionRepo,
      storageService: this._s3StorageService,
      res,
    });
  }

  async downloadAllDocumentsByTransaction(transactionId: string, res: any): Promise<void> {
    return DownloadAllDocumentsByTransactionV2({
      transactionId,
      transactionRepo: this._transactionRepo,
      storageService: this._s3StorageService,
      res,
    });
  }

  async getTreeView(
    userId: string,
    page?: number,
    limit?: number,
    search?: string,
  ): Promise<{ data: TransactionView[]; meta: CustomMeta }> {
    return GetTreeView({
      userId,
      page,
      limit,
      search,
      userRepo: this._userRepo,
      documentRepo: this._documentRepo,
      transactionRepo: this._transactionRepo,
    });
  }
}
