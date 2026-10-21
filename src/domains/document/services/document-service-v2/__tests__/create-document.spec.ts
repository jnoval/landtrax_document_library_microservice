import { HttpException, HttpStatus } from '@nestjs/common';
import CreateDocumentV2 from '../create-document.js';

describe('CreateDocumentV2', () => {
  let mockUserRepo: any;
  let mockDocumentRepo: any;

  beforeEach(() => {
    mockUserRepo = {
      findOne: jest.fn(),
    };

    mockDocumentRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };
  });
  it('should throw an error if document creation fails', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 'user-1' });
    mockDocumentRepo.create.mockReturnValue(null);

    await expect(
      CreateDocumentV2({
        userId: 'user-1',
        data: {} as any,
        userRepo: mockUserRepo,
        documentRepo: mockDocumentRepo,
      }),
    ).rejects.toThrow(
      new HttpException('Something went wrong in creating document', HttpStatus.BAD_REQUEST),
    );
  });

  it('should throw an error if document save fails', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 'user-1' });
    mockDocumentRepo.create.mockReturnValue({ id: 'doc-1' });
    mockDocumentRepo.save.mockResolvedValue(null);

    await expect(
      CreateDocumentV2({
        userId: 'user-1',
        data: {} as any,
        userRepo: mockUserRepo,
        documentRepo: mockDocumentRepo,
      }),
    ).rejects.toThrow(
      new HttpException('Something went wrong on saving document', HttpStatus.FAILED_DEPENDENCY),
    );
  });

  it('should create and save a document successfully', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 'user-1' });
    mockDocumentRepo.create.mockReturnValue({ id: 'doc-1', userId: 'user-1' });
    mockDocumentRepo.save.mockResolvedValue({ id: 'doc-1', userId: 'user-1' });

    const result = await CreateDocumentV2({
      userId: 'user-1',
      data: { originalFileName: 'test.pdf' } as any,
      userRepo: mockUserRepo,
      documentRepo: mockDocumentRepo,
    });

    expect(result).toEqual({
      success: true,
      message: 'Document created',
      data: { id: 'doc-1', userId: 'user-1' },
    });
    expect(mockDocumentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        originalFileName: 'test.pdf',
      }),
    );
    expect(mockDocumentRepo.save).toHaveBeenCalled();
  });
});
