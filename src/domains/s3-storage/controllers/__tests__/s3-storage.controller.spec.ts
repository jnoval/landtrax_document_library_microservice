import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'node:stream';
import { S3StorageController } from '../s3-storage.controller.js';
import { S3StorageService } from '../../services/s3-storage.service.js';

describe('S3StorageController', () => {
  let controller: S3StorageController;
  let mockS3StorageService: jest.Mocked<Partial<S3StorageService>>;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, GATEWAY_SECRET: 'test-secret' };

    mockS3StorageService = {
      uploadStream: jest.fn().mockResolvedValue({
        key: 'incoming/ocr/test.pdf',
        publicURL: 'https://test-bucket.s3.ap-southeast-1.amazonaws.com/incoming/ocr/test.pdf',
      }),
      uploadFile: jest.fn().mockResolvedValue({
        key: 'transactions/test.pdf',
        publicURL: 'https://test-bucket.s3.ap-southeast-1.amazonaws.com/transactions/test.pdf',
        fileSize: 512,
        mimeType: 'application/pdf',
      }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn().mockResolvedValue('https://signed.example.com/view'),
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example.com/download'),
      fileExists: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [S3StorageController],
      providers: [
        {
          provide: S3StorageService,
          useValue: mockS3StorageService,
        },
      ],
    }).compile();

    controller = module.get<S3StorageController>(S3StorageController);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('TCP MessagePatterns', () => {
    it('should respond to s3-storage.is-online', () => {
      const res = controller.isOnline();
      expect(res.status).toBe('OK');
    });

    it('should return signed url via TCP', async () => {
      const res = await controller.getSignedUrl({ key: 'folder/doc.pdf', expiresIn: 3600 });
      expect(res).toEqual({ url: 'https://signed.example.com/view' });
      expect(mockS3StorageService.getSignedUrl).toHaveBeenCalledWith('folder/doc.pdf', 3600);
    });

    it('should return signed download url via TCP', async () => {
      const res = await controller.getSignedDownloadUrl({
        key: 'folder/doc.pdf',
        fileName: 'doc.pdf',
        expiresIn: 3600,
      });
      expect(res).toEqual({ url: 'https://signed.example.com/download' });
    });

    it('should check fileExists via TCP', async () => {
      const res = await controller.fileExists({ key: 'folder/doc.pdf' });
      expect(res).toEqual({ exists: true });
    });

    it('should deleteFile via TCP', async () => {
      const res = await controller.deleteFile({ key: 'folder/doc.pdf' });
      expect(res).toEqual({ success: true, key: 'folder/doc.pdf' });
    });
  });

  describe('Internal HTTP Endpoints', () => {
    it('should reject requests with missing or invalid x-gateway-secret', async () => {
      const req = Readable.from(['hello']) as any;
      req.headers = { 'x-gateway-secret': 'wrong-secret' };

      await expect(
        controller.uploadStreamHttp(req, 'incoming/ocr', 'test.pdf', 'application/pdf'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should stream upload via HTTP when x-gateway-secret is valid', async () => {
      const req = Readable.from(['hello']) as any;
      req.headers = {
        'x-gateway-secret': 'test-secret',
        'content-type': 'application/pdf',
      };

      const res = await controller.uploadStreamHttp(
        req,
        'incoming/ocr',
        'test.pdf',
        'application/pdf',
      );

      expect(mockS3StorageService.uploadStream).toHaveBeenCalledWith({
        stream: req,
        folder: 'incoming/ocr',
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
      });
      expect(res).toEqual({
        key: 'incoming/ocr/test.pdf',
        publicURL: 'https://test-bucket.s3.ap-southeast-1.amazonaws.com/incoming/ocr/test.pdf',
        mimeType: 'application/pdf',
      });
    });

    it('should throw BadRequestException if folder is missing on uploadStreamHttp', async () => {
      const req = Readable.from(['hello']) as any;
      req.headers = { 'x-gateway-secret': 'test-secret' };

      await expect(
        controller.uploadStreamHttp(req, '', 'test.pdf', 'application/pdf'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should delete file via HTTP when x-gateway-secret is valid', async () => {
      const req = { headers: { 'x-gateway-secret': 'test-secret' } } as any;
      const res = await controller.deleteFileHttp(req, 'incoming/ocr/test.pdf');

      expect(mockS3StorageService.deleteFile).toHaveBeenCalledWith('incoming/ocr/test.pdf');
      expect(res).toEqual({ success: true, key: 'incoming/ocr/test.pdf' });
    });

    it('should generate signed url via HTTP when x-gateway-secret is valid', async () => {
      const req = { headers: { 'x-gateway-secret': 'test-secret' } } as any;
      const res = await controller.getSignedUrlHttp(req, {
        key: 'incoming/ocr/test.pdf',
        expiresIn: 1800,
      });

      expect(mockS3StorageService.getSignedUrl).toHaveBeenCalledWith(
        'incoming/ocr/test.pdf',
        1800,
      );
      expect(res).toEqual({ url: 'https://signed.example.com/view' });
    });

    it('should generate signed download url via HTTP when x-gateway-secret is valid', async () => {
      const req = { headers: { 'x-gateway-secret': 'test-secret' } } as any;
      const res = await controller.getSignedDownloadUrlHttp(req, {
        key: 'incoming/ocr/test.pdf',
        fileName: 'test.pdf',
        expiresIn: 1800,
      });

      expect(mockS3StorageService.getSignedDownloadUrl).toHaveBeenCalledWith(
        'incoming/ocr/test.pdf',
        'test.pdf',
        1800,
      );
      expect(res).toEqual({ url: 'https://signed.example.com/download' });
    });
  });
});
