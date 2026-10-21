import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextDto } from '../../../../utils/req-context.decorator.js';
import { S3StorageService } from '../../../s3-storage/services/s3-storage.service.js';
import { DocumentControllerV2 } from '../document-v2.controller.js';
import { DocumentServiceV2 } from '../../types.js';

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

describe('DocumentControllerV2', () => {
  let controller: DocumentControllerV2;
  let mockDocumentService: any;
  let mockS3StorageService: any;

  beforeEach(async () => {
    mockDocumentService = {
      getDocument: jest.fn(),
      getOrConvertDocxToPdf: jest.fn(),
      downloadAllDocumentsByTransactionService: jest.fn(),
      downloadAllDocumentsByTransaction: jest.fn(),
      create: jest.fn(),
      getDocumentByRequirement: jest.fn(),
      updateOCRField: jest.fn(),
      getTreeView: jest.fn(),
      getUploadedBy: jest.fn(),
    };

    mockS3StorageService = {
      getSignedUrl: jest.fn(),
      getSignedDownloadUrl: jest.fn(),
      getFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentControllerV2],
      providers: [
        { provide: DocumentServiceV2, useValue: mockDocumentService },
        { provide: S3StorageService, useValue: mockS3StorageService },
      ],
    }).compile();

    controller = module.get<DocumentControllerV2>(DocumentControllerV2);
  });

  describe('getDocumentURL', () => {
    it('should return presigned URL', async () => {
      mockDocumentService.getDocument.mockResolvedValue({ fileURL: 'test.pdf' });
      mockS3StorageService.getSignedUrl.mockResolvedValue('signed-url');

      const result = await controller.getDocumentURL(mockReqContext, 'doc-1');

      expect(result).toEqual({
        success: true,
        message: 'Document found',
        data: 'signed-url',
      });
      expect(mockS3StorageService.getSignedUrl).toHaveBeenCalledWith('test.pdf');
    });

    it('should convert docx to pdf', async () => {
      mockDocumentService.getDocument.mockResolvedValue({ fileURL: 'test.docx' });
      mockDocumentService.getOrConvertDocxToPdf.mockResolvedValue('test.pdf');
      mockS3StorageService.getSignedUrl.mockResolvedValue('signed-url');

      await controller.getDocumentURL(mockReqContext, 'doc-1');

      expect(mockDocumentService.getOrConvertDocxToPdf).toHaveBeenCalledWith('test.docx');
      expect(mockS3StorageService.getSignedUrl).toHaveBeenCalledWith('test.pdf');
    });
  });

  describe('downloadDocument', () => {
    it('should return download presigned URL', async () => {
      mockDocumentService.getDocument.mockResolvedValue({
        fileURL: 'test.pdf',
        originalFileName: 'test.pdf',
      });
      mockS3StorageService.getSignedDownloadUrl.mockResolvedValue('signed-download-url');

      const result = await controller.downloadDocument(mockReqContext, 'doc-1');

      expect(result).toEqual({
        success: true,
        message: 'Document found',
        data: 'signed-download-url',
      });
      expect(mockS3StorageService.getSignedDownloadUrl).toHaveBeenCalledWith(
        'test.pdf',
        'test.pdf',
      );
    });
  });

  describe('downloadAllDocuments', () => {
    it('should call service downloadAllDocumentsByTransactionService', async () => {
      const mockRes = {} as any;
      mockDocumentService.downloadAllDocumentsByTransactionService.mockResolvedValue('success');

      const result = await controller.downloadAllDocuments(mockReqContext, 'tx-1', mockRes);

      expect(result).toBe('success');
      expect(mockDocumentService.downloadAllDocumentsByTransactionService).toHaveBeenCalledWith(
        'tx-1',
        mockRes,
      );
    });
  });

  describe('proxyDownload', () => {
    it('should proxy download document', async () => {
      mockDocumentService.getDocument.mockResolvedValue({
        fileURL: 'test.pdf',
        originalFileName: 'test.pdf',
      });
      mockS3StorageService.getFile.mockResolvedValue({
        buffer: Buffer.from('test'),
        contentType: 'application/pdf',
      });

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.proxyDownload(mockReqContext, 'doc-1', mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.send).toHaveBeenCalledWith(Buffer.from('test'));
    });
  });

  describe('create', () => {
    it('should create document', async () => {
      const dto = { originalFileName: 'test.pdf' } as any;
      mockDocumentService.create.mockResolvedValue({ success: true, data: { id: 'doc-1' } });

      const result = await controller.create(mockReqContext, dto);

      expect(result).toEqual({ success: true, data: { id: 'doc-1' } });
      expect(mockDocumentService.create).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getDocument', () => {
    it('should get document', async () => {
      mockDocumentService.getDocument.mockResolvedValue({ id: 'doc-1' });

      const result = await controller.getDocument(mockReqContext, 'doc-1');

      expect(result).toEqual({ id: 'doc-1' });
    });
  });

  describe('getDocumentByRequirement', () => {
    it('should get document by requirement', async () => {
      mockDocumentService.getDocumentByRequirement.mockResolvedValue([{ id: 'doc-1' }]);

      const result = await controller.getDocumentByRequirement(mockReqContext, 'req-1', 'ts-1');

      expect(result).toEqual([{ id: 'doc-1' }]);
    });
  });

  describe('updateOCRField', () => {
    it('should update OCR field', async () => {
      const dto = { ocrText: 'test' } as any;
      mockDocumentService.getDocument.mockResolvedValue({ id: 'doc-1' });
      mockDocumentService.updateOCRField.mockResolvedValue({ success: true });

      const result = await controller.updateOCRField(mockReqContext, 'doc-1', dto);

      expect(result).toEqual({ success: true });
      expect(mockDocumentService.updateOCRField).toHaveBeenCalledWith('doc-1', 'user-1', dto);
    });
  });
});
