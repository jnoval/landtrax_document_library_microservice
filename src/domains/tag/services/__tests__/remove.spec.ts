import { IsNull, Repository } from 'typeorm';
import DocumentTagEntity from '../../../../shared/infrastructure/database/entities/document-tag.entity.js';
import TagEntity from '../../../../shared/infrastructure/database/entities/tag.entity.js';
import { TagServiceImpl } from '../tag.service.js';

const mockReqContext = { userId: '1', ip: '127.0.0.1', userAgent: 'test-agent' } as any;

describe('TagServiceImpl - remove', () => { 
  
  let service: TagServiceImpl;
  let tagRepo: Repository<TagEntity>;
  let documentTagRepo: Repository<DocumentTagEntity>;

  const mockTagRepo = {
    findOne: jest.fn(),
    softDelete: jest.fn(),
  };

  const mockDocumentTagRepo = {
    count: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => {
    service = new TagServiceImpl(mockTagRepo as any, mockDocumentTagRepo as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockTagRepo.findOne.mockReset();
    mockDocumentTagRepo.count.mockReset();
    mockDocumentTagRepo.update.mockReset();
    mockTagRepo.softDelete.mockReset();
  });

  it('should soft delete tag and return deletion summary', async () => {
    const tagId = 'tag-uuid';
    const userId = 'user-uuid';

    const tag = {
      id: tagId,
      name: 'Tag to Delete',
      userId,
    };

    mockTagRepo.findOne.mockResolvedValue(tag);
    mockDocumentTagRepo.count.mockResolvedValue(3);
    mockDocumentTagRepo.update.mockResolvedValue({ affected: 3 });
    mockTagRepo.softDelete.mockResolvedValue({ affected: 1 });

    const result = await service.remove(tagId, userId);

    expect(result).toEqual({
      message: 'Tag "Tag to Delete" deleted successfully',
      deletedId: tagId,
      documentsUpdated: 3,
    });
    expect(mockTagRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: tagId,
        deletedDate: IsNull(),
        // No userId filter since 'user-uuid' is not a valid UUID
      },
    });
    expect(mockDocumentTagRepo.count).toHaveBeenCalledWith({
      where: {
        tagId,
        deletedDate: IsNull(),
      },
    });
    expect(mockDocumentTagRepo.update).toHaveBeenCalledWith(
      { tagId, deletedDate: IsNull() },
      { deletedDate: expect.any(Date) },
    );
    expect(mockTagRepo.softDelete).toHaveBeenCalledWith(tagId);
  });

  it('should handle tag with no document associations', async () => {
    const tagId = 'unused-tag-uuid';

    const tag = {
      id: tagId,
      name: 'Unused Tag',
    };

    mockTagRepo.findOne.mockResolvedValue(tag);
    mockDocumentTagRepo.count.mockResolvedValue(0);
    mockTagRepo.softDelete.mockResolvedValue({ affected: 1 });

    const result = await service.remove(tagId);

    expect(result.documentsUpdated).toBe(0);
    // Update is still called even with 0 documents to soft delete associations
  });
  it('should validate user ownership', async () => {
    const tagId = 'tag-uuid';
    const wrongUserId = 'wrong-user';

    mockTagRepo.findOne.mockResolvedValue(null); // Tag not found for wrong user

    await expect(service.remove(tagId, wrongUserId)).rejects.toThrow(
      `Tag with ID ${tagId} not found`,
    );
  });

  it('should skip user filtering for invalid UUID', async () => {
    const tagId = 'tag-uuid';
    const invalidUserId = 'invalid-user-id';

    const tag = {
      id: tagId,
      name: 'Tag',
    };

    mockTagRepo.findOne.mockResolvedValue(tag);
    mockDocumentTagRepo.count.mockResolvedValue(0);
    mockTagRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove(tagId, invalidUserId);

    // Should find tag without user filtering
    expect(mockTagRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: tagId,
        deletedDate: IsNull(),
        // No userId filter since invalid UUID
      },
    });
  });

  it('should handle document count query error', async () => {
    const tagId = 'tag-uuid';
    const tag = { id: tagId, name: 'Tag' };

    mockTagRepo.findOne.mockResolvedValue(tag);
    mockDocumentTagRepo.count.mockRejectedValue(new Error('Count query failed'));

    await expect(service.remove(tagId)).rejects.toThrow('Count query failed');
  });

  it('should handle document update error', async () => {
    const tagId = 'tag-uuid';
    const tag = { id: tagId, name: 'Tag' };

    mockTagRepo.findOne.mockResolvedValue(tag);
    mockDocumentTagRepo.count.mockResolvedValue(2);
    mockDocumentTagRepo.update.mockRejectedValue(new Error('Update failed'));

    await expect(service.remove(tagId)).rejects.toThrow('Update failed');
  });

  it('should handle tag soft delete error', async () => {
    const tagId = 'tag-uuid';
    const tag = { id: tagId, name: 'Tag' };

    mockTagRepo.findOne.mockResolvedValue(tag);
    mockDocumentTagRepo.count.mockResolvedValue(0);
    mockTagRepo.softDelete.mockRejectedValue(new Error('Soft delete failed'));

    await expect(service.remove(tagId)).rejects.toThrow('Soft delete failed');
  });

  it('should return correct message format', async () => {
    const tagNames = ['Simple Tag', 'Complex Tag Name', 'Tag-with-dashes'];

    for (const tagName of tagNames) {
      const tag = {
        id: 'tag-uuid',
        name: tagName,
      };

      mockTagRepo.findOne.mockResolvedValue(tag);
      mockDocumentTagRepo.count.mockResolvedValue(1);
      mockDocumentTagRepo.update.mockResolvedValue({ affected: 1 });
      mockTagRepo.softDelete.mockResolvedValue({ affected: 1 });

      const result = await service.remove('tag-uuid');

      expect(result.message).toBe(`Tag "${tagName}" deleted successfully`);
    }
  });
});
