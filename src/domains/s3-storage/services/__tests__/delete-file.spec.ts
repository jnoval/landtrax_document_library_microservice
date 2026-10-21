import { getRepositoryToken } from '@nestjs/typeorm';
import SystemSettingEntity from '../../../../shared/infrastructure/database/entities/system-setting.entity.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import S3StorageService from '../s3-storage.service.js';
import {
  createAWSError,
  createMockConfigService,
  createMockS3Client,
  createMockS3DeleteResponse,
  TEST_S3_KEY,
} from './test-utils';

describe('S3StorageService - deleteFile', () => {
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

  describe('successful deletions', () => {
    it('should delete file successfully', async () => {
      mockS3Client.send.mockResolvedValue(createMockS3DeleteResponse());

      await service.deleteFile(TEST_S3_KEY);

      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
      const commandCall = mockS3Client.send.mock.calls[0][0] as DeleteObjectCommand;
      expect(commandCall.input.Bucket).toBe('test-bucket');
      expect(commandCall.input.Key).toBe(TEST_S3_KEY);
    });
  });

  describe('validation errors', () => {
    it('should throw BadRequestException when client is not initialized', async () => {
      (service as any)._client = null;

      await expect(service.deleteFile(TEST_S3_KEY)).rejects.toThrow(
        'Storage service is currently not configured.',
      );
    });
  });

  describe('S3 deletion failures', () => {
    it('should throw BadRequestException for other errors', async () => {
      const accessDeniedError = createAWSError('AccessDenied', 'Access Denied');
      mockS3Client.send.mockRejectedValue(accessDeniedError);

      await expect(service.deleteFile(TEST_S3_KEY)).rejects.toThrow('Access Denied');
    });
  });

  describe('logging', () => {
    it('should log successful deletions', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      mockS3Client.send.mockResolvedValue(createMockS3DeleteResponse());

      await service.deleteFile(TEST_S3_KEY);

      expect(loggerSpy).toHaveBeenCalledWith(`File deleted from S3: ${TEST_S3_KEY}`);
      loggerSpy.mockRestore();
    });

    it('should log deletion errors', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const error = createAWSError('AccessDenied', 'Access Denied');
      mockS3Client.send.mockRejectedValue(error);

      try {
        await service.deleteFile(TEST_S3_KEY);
      } catch {
        // Expected
      }

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to delete file from S3: ${TEST_S3_KEY}`),
      );
      loggerSpy.mockRestore();
    });
  });
});
