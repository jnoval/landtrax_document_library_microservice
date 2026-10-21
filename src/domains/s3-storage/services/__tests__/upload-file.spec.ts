import { getRepositoryToken } from '@nestjs/typeorm';
import SystemSettingEntity from '../../../../shared/infrastructure/database/entities/system-setting.entity.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import S3StorageService from '../s3-storage.service.js';
import {
  createAWSError,
  createMockConfigService,
  createMockMulterFile,
  createMockS3Client,
  createMockS3UploadResponse,
  createS3PermanentRedirectError,
  createTestUploadParams,
} from './test-utils';

const mockReqContext = { userId: '1', ip: '127.0.0.1', userAgent: 'test-agent' } as any;

describe('S3StorageService - uploadFile', () => { 
  
  let service: S3StorageService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockS3Client: jest.Mocked<any>;

  beforeEach(async () => {
    mockConfigService = createMockConfigService() as unknown as jest.Mocked<ConfigService>;
    mockS3Client = createMockS3Client();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3StorageService,
        {
          provide: getRepositoryToken(SystemSettingEntity),
          useValue: {
            findOne: jest.fn().mockResolvedValue({ value: 'true' }),
          },
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<S3StorageService>(S3StorageService);

    // Mock the private S3Client
    (service as any)._client = mockS3Client;
    (service as any)._bucketName = 'test-bucket';
    (service as any)._region = 'us-east-1';
    (service as any)._isConfigured = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('successful uploads', () => { 
  
    it('should upload file successfully and return response', async () => {
      mockS3Client.send.mockResolvedValue(createMockS3UploadResponse());

      const params = createTestUploadParams();
      const result = await service.uploadFile(params);

      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
      expect(result).toEqual({
        key: expect.stringContaining('test-folder/'),
        publicURL: expect.stringContaining(
          'https://test-bucket.s3.us-east-1.amazonaws.com/test-folder/',
        ),
        fileSize: 1024,
        mimeType: 'application/pdf',
      });
    });

    it('should use custom filename if provided', async () => {
      mockS3Client.send.mockResolvedValue(createMockS3UploadResponse());

      const params = createTestUploadParams({ fileName: 'custom-name.pdf' });
      const result = await service.uploadFile(params);

      expect(result.key).toBe('test-folder/custom-name.pdf');
      expect(result.publicURL).toBe(
        'https://test-bucket.s3.us-east-1.amazonaws.com/test-folder/custom-name.pdf',
      );
    });

    it('should sanitize filenames with special characters', async () => {
      const file = createMockMulterFile({
        originalname: 'test@#$%^&*().pdf',
      });
      const params = createTestUploadParams({ file });

      mockS3Client.send.mockResolvedValue(createMockS3UploadResponse());

      const result = await service.uploadFile(params);

      // Should not contain special characters except underscore and dot
      expect(result.key).toMatch(/^test-folder\/test\.pdf_\d+_[a-f0-9]+\.pdf$/);
    });
  });

  describe('validation errors', () => { 
  
    it('should throw BadRequestException when client is not initialized', async () => {
      (service as any)._client = null;

      await expect(service.uploadFile(createTestUploadParams())).rejects.toThrow(
        'Storage service is currently not configured.',
      );
    });

    it('should throw BadRequestException when file buffer is missing', async () => {
      const file = createMockMulterFile({ buffer: null as any });
      const params = createTestUploadParams({ file });

      await expect(service.uploadFile(params)).rejects.toThrow('File buffer is required');
    });
  });

  describe('S3 upload failures', () => { 
  
    it('should handle access denied errors', async () => {
      const accessDeniedError = createAWSError('AccessDenied', 'Access Denied');
      mockS3Client.send.mockRejectedValue(accessDeniedError);

      await expect(service.uploadFile(createTestUploadParams())).rejects.toThrow(
        'Failed to upload file to S3: Access Denied',
      );
    });
    it('should handle PermanentRedirect errors with helpful message', async () => {
      const redirectError = createS3PermanentRedirectError();
      mockS3Client.send.mockRejectedValue(redirectError);

      await expect(service.uploadFile(createTestUploadParams())).rejects.toThrow(
        /bucket region mismatch/i,
      );
    });
  });

  describe('logging', () => { 
  
    it('should log successful uploads', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      mockS3Client.send.mockResolvedValue(createMockS3UploadResponse());

      await service.uploadFile(createTestUploadParams());

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('File uploaded to S3'));
      loggerSpy.mockRestore();
    });

    it('should log upload errors', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const error = new Error('Upload failed');
      mockS3Client.send.mockRejectedValue(error);

      try {
        await service.uploadFile(createTestUploadParams());
      } catch {
        // Expected
      }

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to upload file to S3'),
        expect.any(String),
      );
      loggerSpy.mockRestore();
    });
  });
});
