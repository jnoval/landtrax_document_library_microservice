import { HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Repository } from 'typeorm';
import DownloadAllDocumentsByTransactionServiceV2 from '../download-all-documents-by-transaction-service.js';

// Mock archiver
const mArchiver = {
  pipe: jest.fn(),
  on: jest.fn(),
  append: jest.fn(),
  finalize: jest.fn().mockResolvedValue(undefined),
};

jest.mock('archiver', () => {
  return {
    ZipArchive: jest.fn().mockImplementation(() => mArchiver),
  };
});

describe('DownloadAllDocumentsByTransactionServiceV2', () => {
  let mockTransactionRepo: jest.Mocked<Repository<any>>;
  let mockStorageService: any;
  let mockRes: jest.Mocked<Response>;
  const transactionId = 'test-transaction-id';

  beforeEach(() => {
    mockTransactionRepo = {
      findOne: jest.fn(),
    } as any;

    mockStorageService = {
      getFile: jest.fn().mockResolvedValue({
        buffer: Buffer.from('test-file-content'),
        contentType: 'application/pdf',
      }),
    };

    mockRes = {
      setHeader: jest.fn(),
    } as any;

    jest.clearAllMocks();
  });
  it('should throw 404 if no requirement documents are found', async () => {
    mockTransactionRepo.findOne.mockResolvedValueOnce({
      transactionNumber: 'TX-001',
      transactionServices: [
        {
          service: { name: 'Test Service' },
          documents: [
            { category: 'OUTPUT_DOCUMENT', originalFileName: 'out.pdf' }, // Only output doc
          ],
        },
      ],
    });

    await expect(
      DownloadAllDocumentsByTransactionServiceV2({
        transactionId,
        transactionRepo: mockTransactionRepo,
        storageService: mockStorageService,
        res: mockRes,
      }),
    ).rejects.toThrow(
      new HttpException(
        'No requirement documents found for this transaction',
        HttpStatus.NOT_FOUND,
      ),
    );
  });

  it('should generate a zip with requirement documents arranged in folders', async () => {
    mockTransactionRepo.findOne.mockResolvedValueOnce({
      transactionNumber: 'TX-001',
      transactionServices: [
        {
          service: { name: 'Service A' },
          documents: [
            {
              category: 'REQUIREMENT',
              type: 'PDF',
              originalFileName: 'req1.pdf',
              requirement: { name: 'ID Proof' },
              fileURL: 'url1',
            },
            {
              category: 'OUTPUT_DOCUMENT',
              type: 'OUTPUT_DOCUMENT',
              originalFileName: 'out1.pdf',
              fileURL: 'url2',
            }, // Should be ignored
          ],
        },
        {
          service: { name: 'Service B' },
          documents: [
            {
              category: 'REQUIREMENT',
              type: 'PDF',
              originalFileName: 'req2.pdf',
              requirement: { name: 'Address Proof' },
              fileURL: 'url3',
            },
          ],
        },
      ],
    });

    await DownloadAllDocumentsByTransactionServiceV2({
      transactionId,
      transactionRepo: mockTransactionRepo,
      storageService: mockStorageService,
      res: mockRes,
    });

    // Verify headers
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="TX_001_Documents.zip"',
    );

    // Verify archive interactions
    expect(mArchiver.pipe).toHaveBeenCalledWith(mockRes);
    expect(mArchiver.append).toHaveBeenCalledTimes(2);
    expect(mArchiver.append).toHaveBeenCalledWith(expect.any(Buffer), {
      name: 'Service A/ID Proof/req1.pdf',
    });
    expect(mArchiver.append).toHaveBeenCalledWith(expect.any(Buffer), {
      name: 'Service B/Address Proof/req2.pdf',
    });
    expect(mArchiver.finalize).toHaveBeenCalled();
  });

  it('should handle duplicate filenames by adding counters', async () => {
    mockTransactionRepo.findOne.mockResolvedValueOnce({
      transactionNumber: 'TX-002',
      transactionServices: [
        {
          service: { name: 'Service C' },
          documents: [
            {
              category: 'REQUIREMENT',
              type: 'PDF',
              originalFileName: 'duplicate.pdf',
              requirement: { name: 'Doc' },
              fileURL: 'url1',
            },
            {
              category: 'REQUIREMENT',
              type: 'PDF',
              originalFileName: 'duplicate.pdf',
              requirement: { name: 'Doc' },
              fileURL: 'url2',
            },
          ],
        },
      ],
    });

    await DownloadAllDocumentsByTransactionServiceV2({
      transactionId,
      transactionRepo: mockTransactionRepo,
      storageService: mockStorageService,
      res: mockRes,
    });

    expect(mArchiver.append).toHaveBeenCalledWith(expect.any(Buffer), {
      name: 'Service C/Doc/duplicate.pdf',
    });
    expect(mArchiver.append).toHaveBeenCalledWith(expect.any(Buffer), {
      name: 'Service C/Doc/duplicate_(1).pdf',
    });
  });
});
