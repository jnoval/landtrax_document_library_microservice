import { getRepositoryToken } from '@nestjs/typeorm';
import SystemSettingEntity from '../../../../shared/infrastructure/database/entities/system-setting.entity.js';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import S3StorageService from '../s3-storage.service.js';
import {
  createAWSError,
  createMockConfigService,
  createMockS3Client,
  createS3PermanentRedirectError,
  createTestUploadParams,
} from './test-utils';

const mockReqContext = { userId: '1', ip: '127.0.0.1', userAgent: 'test-agent' } as any;

describe('S3StorageService - Error Handling', () => { 
  
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

  describe('Region Mismatch Handling', () => { 
  
    it('should provide helpful error message for PermanentRedirect', async () => {
      const error = createS3PermanentRedirectError();
      mockS3Client.send.mockRejectedValue(error);
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await expect(service.uploadFile(createTestUploadParams())).rejects.toThrow(
        /bucket region mismatch/i,
      );

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('S3 bucket region mismatch'));
      loggerSpy.mockRestore();
    });

    it('should provide helpful error message when error message includes "endpoint"', async () => {
      const error = createAWSError(
        'SomeError',
        'The bucket you are attempting to access must be addressed using the specified endpoint',
      );
      mockS3Client.send.mockRejectedValue(error);
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await expect(service.uploadFile(createTestUploadParams())).rejects.toThrow(
        /bucket region mismatch/i,
      );

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('S3 bucket region mismatch'));
      loggerSpy.mockRestore();
    });
  });

  describe('General Error Handling', () => { 
  
    it('should wrap unknown errors in BadRequestException', async () => {
      const error = new Error('Unknown error');
      mockS3Client.send.mockRejectedValue(error);

      await expect(service.uploadFile(createTestUploadParams())).rejects.toThrow(
        'Failed to upload file to S3: Unknown error',
      );
    });
  });
});
