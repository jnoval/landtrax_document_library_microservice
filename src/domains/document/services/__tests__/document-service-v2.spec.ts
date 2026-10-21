import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { createMockRepository } from '../../../../../test/database-mock.js';
import DocumentTagEntity from '../../../../shared/infrastructure/database/entities/document-tag.entity.js';
import DocumentEntity from '../../../../shared/infrastructure/database/entities/document.entity.js';
import RequirementEntity from '../../../../shared/infrastructure/database/entities/requirement.entity.js';
import TagEntity from '../../../../shared/infrastructure/database/entities/tag.entity.js';
import TransactionServiceEntity from '../../../../shared/infrastructure/database/entities/transaction-service.entity.js';
import TransactionEntity from '../../../../shared/infrastructure/database/entities/transaction.entity.js';
import UserCompanyEntity from '../../../../shared/infrastructure/database/entities/user-company.entity.js';
import UserEntity from '../../../../shared/infrastructure/database/entities/user.entity.js';
import * as docxToPdfModule from '../../../../utils/docx-to-pdf.js';
import { S3StorageService } from '../../../s3-storage/services/s3-storage.service.js';
import { CompanyScopeHelper } from '../company-scope.helper.js';
import { DocumentServiceImplV2 } from '../document-v2.service.js';
import * as createDocumentModule from '../document-service-v2/create-document.js';
import * as downloadAllModule from '../document-service-v2/download-all-documents-by-transaction-service.js';
import * as updateOcrFieldModule from '../document-service-v2/update-ocr-field.js';

const mockReqContext = { userId: '1', ip: '127.0.0.1', userAgent: 'test-agent' } as any;

jest.mock('archiver', () => ({}));
jest.mock('../document-service-v2/create-document.js');
jest.mock('../document-service-v2/update-ocr-field.js');
jest.mock('../document-service-v2/download-all-documents-by-transaction-service.js');
jest.mock('../../../../utils/docx-to-pdf.js');

describe('DocumentServiceImplV2', () => {
  let service: DocumentServiceImplV2;
  let documentRepo: any;
  let s3StorageService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentServiceImplV2,
        {
          provide: getRepositoryToken(DocumentEntity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(RequirementEntity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(TagEntity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(DocumentTagEntity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(TransactionServiceEntity),
          useValue: createMockRepository(),
        },
        {
          provide: S3StorageService,
          useValue: {
            getSignedUrl: jest.fn(),
            fileExists: jest.fn(),
            getFile: jest.fn(),
            uploadFile: jest.fn(),
            downloadToFile: jest.fn(),
            uploadStream: jest.fn(),
          },
        },
        CompanyScopeHelper,
        {
          provide: getRepositoryToken(UserCompanyEntity),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get<DocumentServiceImplV2>(DocumentServiceImplV2);
    documentRepo = module.get(getRepositoryToken(DocumentEntity));
    documentRepo.query = jest.fn();
    s3StorageService = module.get(S3StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call CreateDocumentV2', async () => {
      const mockResult = { id: 'test' };
      (createDocumentModule.default as jest.Mock).mockResolvedValue(mockResult);
      const res = await service.create('user1', {} as any);
      expect(res).toBe(mockResult);
      expect(createDocumentModule.default).toHaveBeenCalled();
    });
  });

  describe('updateOCRField', () => {
    it('should call UpdateOCRField', async () => {
      const mockResult = { id: 'test' };
      (updateOcrFieldModule.default as jest.Mock).mockResolvedValue(mockResult);
      const res = await service.updateOCRField('doc1', 'user1', {} as any);
      expect(res).toBe(mockResult);
      expect(updateOcrFieldModule.default).toHaveBeenCalled();
    });
  });

  describe('getDocumentByRequirement', () => {
    it('should query document repository', async () => {
      const documents = [{ id: 'doc1' }] as DocumentEntity[];
      documentRepo.find.mockResolvedValue(documents);

      const res = await service.getDocumentByRequirement('req1', 'trans1');

      expect(res).toBe(documents);
      expect(documentRepo.find).toHaveBeenCalledWith({
        where: {
          requirementId: 'req1',
          transactionServiceId: 'trans1',
          deletedDate: IsNull(),
        },
      });
    });

    it('should return empty array if null', async () => {
      documentRepo.find.mockResolvedValue([]);

      const res = await service.getDocumentByRequirement('req1', 'trans1');

      expect(res).toEqual([]);
    });
  });

  describe('getDocument', () => {
    it('should return document and format user info', async () => {
      const mockDoc = {
        id: 'doc1',
        fileURL: 'file.pdf',
        user: { firstName: 'John', lastName: 'Doe', email: 'j@d.com', username: 'jdoe' },
      };
      documentRepo.findOne.mockResolvedValue(mockDoc);
      s3StorageService.getSignedUrl.mockResolvedValue('http://signed.url');

      const res = await service.getDocument('doc1');

      expect(s3StorageService.getSignedUrl).toHaveBeenCalledWith('file.pdf');
      expect(res.thumbnailUrl).toBe('http://signed.url');
      expect(res.uploader?.name).toBe('John Doe');
      expect(res.user).toBeUndefined();
    });
  });

  describe('getOrConvertDocxToPdf', () => {
    it('should return cached PDF if it exists', async () => {
      s3StorageService.fileExists.mockResolvedValue(true);
      const res = await service.getOrConvertDocxToPdf('test.docx');
      expect(res).toBe('test.pdf');
      expect(s3StorageService.fileExists).toHaveBeenCalledWith('test.pdf');
      expect(s3StorageService.getFile).not.toHaveBeenCalled();
    });

    it('should convert and upload if not exists', async () => {
      s3StorageService.fileExists.mockResolvedValue(false);
      s3StorageService.downloadToFile.mockResolvedValue(undefined);
      (docxToPdfModule.convertDocxToPdfFile as jest.Mock).mockResolvedValue(undefined);
      s3StorageService.uploadStream.mockResolvedValue(undefined);

      jest.spyOn(require('node:fs'), 'createReadStream').mockReturnValue({} as any);
      jest.spyOn(require('node:fs'), 'existsSync').mockReturnValue(true);
      jest.spyOn(require('node:fs'), 'unlinkSync').mockReturnValue(undefined);

      const res = await service.getOrConvertDocxToPdf('folder/test.docx');

      expect(res).toBe('folder/test.pdf');
      expect(s3StorageService.downloadToFile).toHaveBeenCalledWith('folder/test.docx', expect.any(String));
      expect(docxToPdfModule.convertDocxToPdfFile).toHaveBeenCalled();
      expect(s3StorageService.uploadStream).toHaveBeenCalled();
    });

    it('should fallback to original key on error', async () => {
      s3StorageService.fileExists.mockRejectedValue(new Error('error'));
      const res = await service.getOrConvertDocxToPdf('test.docx');
      expect(res).toBe('test.docx');
    });
  });

  describe('downloadAllDocumentsByTransactionService', () => {
    it('should call DownloadAllDocumentsByTransactionServiceV2', async () => {
      (downloadAllModule.default as jest.Mock).mockResolvedValue(undefined);
      await service.downloadAllDocumentsByTransactionService('trans1', {} as any);
      expect(downloadAllModule.default).toHaveBeenCalled();
    });
  });
});
