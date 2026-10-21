import { HttpException, HttpStatus } from '@nestjs/common';
import UpdateOCRField from '../update-ocr-field.js';

describe('UpdateOCRField', () => {
  let mockUserRepo: any;
  let mockDocumentRepo: any;

  beforeEach(() => {
    mockUserRepo = {
      findOne: jest.fn(),
    };

    mockDocumentRepo = {
      findOne: jest.fn(),
      merge: jest.fn(),
      save: jest.fn(),
    };
  });
  it('should throw an error if document update fails', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 'user-1' });
    mockDocumentRepo.findOne.mockResolvedValue({ id: 'doc-1' });
    mockDocumentRepo.save.mockResolvedValue(null);

    await expect(
      UpdateOCRField({
        documentId: 'doc-1',
        userId: 'user-1',
        data: {} as any,
        userRepo: mockUserRepo,
        documentRepo: mockDocumentRepo,
      }),
    ).rejects.toThrow(
      new HttpException('Something went wrong updating document', HttpStatus.FAILED_DEPENDENCY),
    );
  });

  it('should update and save OCR field successfully', async () => {
    const existingDoc = { id: 'doc-1' };
    const updatedDoc = { id: 'doc-1', ocrText: 'test text' };

    mockUserRepo.findOne.mockResolvedValue({ id: 'user-1' });
    mockDocumentRepo.findOne.mockResolvedValue(existingDoc);
    mockDocumentRepo.save.mockResolvedValue(updatedDoc);

    const dataToUpdate = { ocrText: 'test text' } as any;

    const result = await UpdateOCRField({
      documentId: 'doc-1',
      userId: 'user-1',
      data: dataToUpdate,
      userRepo: mockUserRepo,
      documentRepo: mockDocumentRepo,
    });

    expect(result).toEqual({
      success: true,
      message: 'Document updated',
      data: updatedDoc,
    });
    expect(mockDocumentRepo.merge).toHaveBeenCalledWith(
      existingDoc,
      dataToUpdate,
      expect.objectContaining({ updatedDate: expect.any(Date) }),
    );
    expect(mockDocumentRepo.save).toHaveBeenCalledWith(existingDoc);
  });
});
