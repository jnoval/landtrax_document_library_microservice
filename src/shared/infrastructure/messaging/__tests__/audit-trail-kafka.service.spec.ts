import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditTrailKafkaService } from '../audit-trail-kafka.service.js';
import AuditTrailEntity from '../../database/entities/audit-trail.entity.js';
import { AuditTrailStatus } from '../../../common/status.js';

describe('AuditTrailKafkaService', () => {
  let service: AuditTrailKafkaService;
  let mockAuditTrailRepo: Partial<Record<keyof Repository<AuditTrailEntity>, jest.Mock>>;

  beforeEach(async () => {
    mockAuditTrailRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockResolvedValue({ id: 'audit-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditTrailKafkaService,
        {
          provide: getRepositoryToken(AuditTrailEntity),
          useValue: mockAuditTrailRepo,
        },
      ],
    }).compile();

    service = module.get<AuditTrailKafkaService>(AuditTrailKafkaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should save to DB fallback when Kafka producer is not connected', async () => {
      const result = await service.create({
        userId: 'user-1',
        action: 'OCR Extraction Completed',
        entity: 'OCR',
        details: JSON.stringify({ pages: 2 }),
        result: AuditTrailStatus.SUCCESS,
      });

      expect(result).toEqual({ success: true, transport: 'database' });
      expect(mockAuditTrailRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'OCR Extraction Completed',
          resource: 'OCR',
        }),
      );
      expect(mockAuditTrailRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should emit to Kafka when producer is connected', async () => {
      const mockProducer = {
        send: jest.fn().mockResolvedValue({}),
      };
      (service as any).kafkaProducer = mockProducer;
      (service as any).isProducerConnected = true;

      const result = await service.create({
        userId: 'user-2',
        action: 'Document Uploaded',
        entity: 'DOCUMENT',
      });

      expect(result).toEqual({ success: true, transport: 'kafka' });
      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'audit-trail.log',
          messages: [
            expect.objectContaining({
              key: 'user-2',
              value: expect.stringContaining('Document Uploaded'),
            }),
          ],
        }),
      );
      expect(mockAuditTrailRepo.save).not.toHaveBeenCalled();
    });

    it('should fallback to DB if Kafka producer send fails', async () => {
      const mockProducer = {
        send: jest.fn().mockRejectedValue(new Error('Broker unreachable')),
      };
      (service as any).kafkaProducer = mockProducer;
      (service as any).isProducerConnected = true;

      const result = await service.create({
        userId: 'user-3',
        action: 'OCR Failed',
        entity: 'OCR',
      });

      expect(result).toEqual({ success: true, transport: 'database' });
      expect(mockAuditTrailRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
