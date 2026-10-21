import { getRepositoryToken } from '@nestjs/typeorm';
import SystemSettingEntity from '../../../../shared/infrastructure/database/entities/system-setting.entity.js';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import S3StorageService from '../s3-storage.service.js';
import {
  createAWSError,
  createMockConfigService,
  createMockS3Client,
  createMockS3HeadResponse,
  TEST_S3_KEY,
} from './test-utils';

const mockReqContext = { userId: '1', ip: '127.0.0.1', userAgent: 'test-agent' } as any;

describe('S3StorageService - fileExists', () => { 
  
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

  describe('successful checks', () => { 
  
    it('should return true if file exists', async () => {
      mockS3Client.send.mockResolvedValue(createMockS3HeadResponse());

      const result = await service.fileExists(TEST_S3_KEY);

      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
      expect(result).toBe(true);
    });
  });

  describe('failures', () => { 
  
    it('should return false if file does not exist (404)', async () => {
      const error = createAWSError('NotFound', 'Not Found', 404);
      mockS3Client.send.mockRejectedValue(error);

      const result = await service.fileExists(TEST_S3_KEY);

      expect(result).toBe(false);
    });

    it('should return false and log error for other errors', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const error = createAWSError('AccessDenied', 'Access Denied');
      mockS3Client.send.mockRejectedValue(error);

      const result = await service.fileExists(TEST_S3_KEY);

      expect(result).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Error checking file existence in S3: ${TEST_S3_KEY}`),
      );
      loggerSpy.mockRestore();
    });
  });

  describe('validation errors', () => { 
  
    it('should throw BadRequestException when client is not initialized', async () => {
      (service as any)._client = null;

      await expect(service.fileExists(TEST_S3_KEY)).rejects.toThrow(
        'Storage service is currently not configured.',
      );
    });
  });
});
