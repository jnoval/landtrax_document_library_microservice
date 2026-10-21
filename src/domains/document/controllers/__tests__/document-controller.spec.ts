import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createMockRepository } from '../../../../../test/database-mock.js';
import TransactionServiceEntity from '../../../../shared/infrastructure/database/entities/transaction-service.entity.js';
import TransactionEntity from '../../../../shared/infrastructure/database/entities/transaction.entity.js';
import { RequestContextDto } from '../../../../utils/req-context.decorator.js';
import { S3StorageService } from '../../../s3-storage/services/s3-storage.service.js';
import { DocumentService } from '../../types.js';
import { DocumentController } from '../document.controller.js';

const mockReqContext: RequestContextDto = {
  userId: 'user-1',
  ip: '127.0.0.1',
  userAgent: 'test-agent',
};

jest.mock('../../../../shared/guards/gateway-user.guard.js', () => ({
  GatewayUserGuard: class {
    canActivate = () => true;
  },
}));

describe('DocumentController', () => {
  let controller: DocumentController;
  let mockDocumentService: any;
  let mockS3StorageService: any;

  beforeEach(async () => {
    mockDocumentService = {
      create: jest.fn(),
      findAll: jest.fn(),
      getTreeView: jest.fn(),
      findOne: jest.fn(),
    };

    mockS3StorageService = {
      uploadFile: jest.fn(),
      getFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentController],
      providers: [
        {
          provide: DocumentService,
          useValue: mockDocumentService,
        },
        {
          provide: S3StorageService,
          useValue: mockS3StorageService,
        },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(TransactionServiceEntity),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    controller = module.get<DocumentController>(DocumentController);
  });

  describe('create', () => {
    it('should create document', async () => {
      const dto = { originalFileName: 'test.pdf' } as any;
      mockDocumentService.create.mockResolvedValue({ id: 'doc-1' });

      const result = await controller.create(dto);

      expect(result).toEqual({ id: 'doc-1' });
      expect(mockDocumentService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should get all documents', async () => {
      mockDocumentService.findAll.mockResolvedValue({ data: [], meta: {} });

      const result = await controller.findAll(mockReqContext);

      expect(result).toEqual({ data: [], meta: {} });
      expect(mockDocumentService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should get one document', async () => {
      mockDocumentService.findOne.mockResolvedValue({ id: 'doc-1' });

      const result = await controller.findOne('doc-1');

      expect(result).toEqual({ id: 'doc-1' });
      expect(mockDocumentService.findOne).toHaveBeenCalledWith('doc-1');
    });
  });
});
