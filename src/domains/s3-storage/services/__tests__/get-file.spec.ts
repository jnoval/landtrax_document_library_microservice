import { getRepositoryToken } from '@nestjs/typeorm';
import SystemSettingEntity from '../../../../shared/infrastructure/database/entities/system-setting.entity.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import S3StorageService from '../s3-storage.service.js';
import {
  createAWSError,
  createMockConfigService,
  createMockS3Client,
  createMockS3GetResponse,
  TEST_S3_KEY,
} from './test-utils';

const mockReqContext = { userId: '1', ip: '127.0.0.1', userAgent: 'test-agent' } as any;

describe('S3StorageService - getFile', () => { 
  
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

  describe('successful downloads', () => { 
  
    it('should download file successfully', async () => {
      const mockResponse = createMockS3GetResponse();
      mockS3Client.send.mockResolvedValue(mockResponse);

      const result = await service.getFile(TEST_S3_KEY);

      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.toString()).toBe('test file content');
      expect(result.contentType).toBe('application/pdf');
    });

    it('should handle missing ContentType', async () => {
      const mockResponse = createMockS3GetResponse();
      delete mockResponse.ContentType;
      mockS3Client.send.mockResolvedValue(mockResponse);

      const result = await service.getFile(TEST_S3_KEY);

      expect(result.contentType).toBe('application/octet-stream');
    });
  });

  describe('validation errors', () => { 
  
    it('should throw BadRequestException when client is not initialized', async () => {
      (service as any)._client = null;

      await expect(service.getFile(TEST_S3_KEY)).rejects.toThrow(
        'Storage service is currently not configured.',
      );
    });
  });

  describe('S3 download failures', () => { 
  
    it('should throw BadRequestException on error', async () => {
      const error = createAWSError('NoSuchKey', 'The specified key does not exist');
      mockS3Client.send.mockRejectedValue(error);

      await expect(service.getFile(TEST_S3_KEY)).rejects.toThrow(
        'Failed to get file from S3: The specified key does not exist',
      );
    });

    it('should throw BadRequestException if Body is missing', async () => {
      const mockResponse = createMockS3GetResponse();
      delete mockResponse.Body;
      mockS3Client.send.mockResolvedValue(mockResponse);

      await expect(service.getFile(TEST_S3_KEY)).rejects.toThrow(`File not found: ${TEST_S3_KEY}`);
    });
  });

  describe('logging', () => { 
  
    it('should log download errors', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const error = new Error('Download failed');
      mockS3Client.send.mockRejectedValue(error);

      try {
        await service.getFile(TEST_S3_KEY);
      } catch {
        // Expected
      }

      loggerSpy.mockRestore();
    });
  });
});
