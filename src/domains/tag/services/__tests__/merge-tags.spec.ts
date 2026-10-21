import { Repository } from 'typeorm';
import DocumentTagEntity from '../../../../shared/infrastructure/database/entities/document-tag.entity.js';
import TagEntity from '../../../../shared/infrastructure/database/entities/tag.entity.js';
import { TagServiceImpl } from '../tag.service.js';

const mockReqContext = { userId: '1', ip: '127.0.0.1', userAgent: 'test-agent' } as any;

describe('TagServiceImpl - mergeTags', () => { 
  
  let service: TagServiceImpl;
  let tagRepo: Repository<TagEntity>;
  let documentTagRepo: Repository<DocumentTagEntity>;

  const mockTagRepo = {
    findOne: jest.fn(),
    softDelete: jest.fn(),
  };

  const mockDocumentTagRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(() => {
    service = new TagServiceImpl(mockTagRepo as any, mockDocumentTagRepo as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should merge source tag into target tag successfully', async () => {
    const sourceTagId = 'source-tag-uuid';
    const targetTagId = 'target-tag-uuid';
    const userId = 'user-uuid';

    const sourceTag = {
      id: sourceTagId,
      name: 'Source Tag',
      userId,
    };

    const targetTag = {
      id: targetTagId,
      name: 'Target Tag',
      userId,
    };

    const sourceDocumentTags = [
      {
        id: 'doc-tag-1',
        documentId: 'doc-1',
        tagId: sourceTagId,
      },
      {
        id: 'doc-tag-2',
        documentId: 'doc-2',
        tagId: sourceTagId,
      },
    ];

    mockTagRepo.findOne
      .mockResolvedValueOnce(sourceTag) // Source tag
      .mockResolvedValueOnce(targetTag); // Target tag

    mockDocumentTagRepo.find.mockResolvedValue(sourceDocumentTags);
    mockDocumentTagRepo.findOne.mockResolvedValue(null); // No existing target tag on documents
    mockDocumentTagRepo.create.mockReturnValue({ documentId: 'doc-1', tagId: targetTagId });
    mockDocumentTagRepo.save.mockResolvedValue({});
    mockTagRepo.softDelete.mockResolvedValue({ affected: 1 });

    const result = await service.mergeTags(sourceTagId, targetTagId, userId);

    expect(result).toEqual({
      success: true,
      message: 'Successfully merged "Source Tag" into "Target Tag"',
      documentsUpdated: 2,
      sourceTagDeleted: true,
    });
  });

  it('should throw BadRequestException when trying to merge tag into itself', async () => {
    const tagId = 'same-tag-uuid';
    const tag = { id: tagId, name: 'Same Tag', userId: 'user-uuid' };

    // Mock the repository to return the tag for source tag lookup
    mockTagRepo.findOne.mockResolvedValue(tag);

    await expect(service.mergeTags(tagId, tagId)).rejects.toThrow('Cannot merge a tag into itself');
  });
  it('should validate user ownership for both tags', async () => {
    const sourceTagId = 'source-tag';
    const targetTagId = 'target-tag';
    const wrongUserId = 'wrong-user';

    mockTagRepo.findOne.mockResolvedValue(null); // Tags not found for wrong user

    await expect(service.mergeTags(sourceTagId, targetTagId, wrongUserId)).rejects.toThrow(
      `Source tag with ID ${sourceTagId} not found`,
    );
  });

  it('should skip creating duplicate document-tag associations', async () => {
    const sourceTagId = 'source-tag';
    const targetTagId = 'target-tag';

    const sourceTag = { id: sourceTagId, name: 'Source' };
    const targetTag = { id: targetTagId, name: 'Target' };

    const sourceDocumentTags = [
      {
        documentId: 'doc-1',
        tagId: sourceTagId,
      },
    ];

    mockTagRepo.findOne.mockResolvedValueOnce(sourceTag).mockResolvedValueOnce(targetTag);

    mockDocumentTagRepo.find.mockResolvedValue(sourceDocumentTags);
    mockDocumentTagRepo.findOne.mockResolvedValue({
      id: 'existing',
      documentId: 'doc-1',
      tagId: targetTagId,
    }); // Already exists
    mockTagRepo.softDelete.mockResolvedValue({ affected: 1 });

    const result = await service.mergeTags(sourceTagId, targetTagId);

    expect(result.documentsUpdated).toBe(0); // No new associations created
    expect(mockDocumentTagRepo.create).not.toHaveBeenCalled();
  });

  it('should handle documents with both source and target tags', async () => {
    const sourceTagId = 'source-tag';
    const targetTagId = 'target-tag';

    const sourceTag = { id: sourceTagId, name: 'Source' };
    const targetTag = { id: targetTagId, name: 'Target' };

    const sourceDocumentTags = [{ documentId: 'doc-1', tagId: sourceTagId }];

    mockTagRepo.findOne.mockResolvedValueOnce(sourceTag).mockResolvedValueOnce(targetTag);

    mockDocumentTagRepo.find.mockResolvedValue(sourceDocumentTags);
    mockDocumentTagRepo.findOne.mockResolvedValue(null); // Target tag doesn't exist on document
    mockDocumentTagRepo.create.mockReturnValue({ documentId: 'doc-1', tagId: targetTagId });
    mockDocumentTagRepo.save.mockResolvedValue({});
    mockTagRepo.softDelete.mockResolvedValue({ affected: 1 });

    const result = await service.mergeTags(sourceTagId, targetTagId);

    expect(result.documentsUpdated).toBe(1);
  });

  it('should handle empty document list', async () => {
    const sourceTagId = 'unused-source';
    const targetTagId = 'target-tag';

    const sourceTag = { id: sourceTagId, name: 'Unused Source' };
    const targetTag = { id: targetTagId, name: 'Target' };

    mockTagRepo.findOne.mockResolvedValueOnce(sourceTag).mockResolvedValueOnce(targetTag);

    mockDocumentTagRepo.find.mockResolvedValue([]); // No documents use this tag
    mockTagRepo.softDelete.mockResolvedValue({ affected: 1 });

    const result = await service.mergeTags(sourceTagId, targetTagId);

    expect(result.documentsUpdated).toBe(0);
    expect(mockDocumentTagRepo.findOne).not.toHaveBeenCalled();
    expect(mockDocumentTagRepo.create).not.toHaveBeenCalled();
  });

  it('should handle repository errors during document operations', async () => {
    const sourceTagId = 'source-tag';
    const targetTagId = 'target-tag';

    const sourceTag = { id: sourceTagId, name: 'Source' };
    const targetTag = { id: targetTagId, name: 'Target' };

    mockTagRepo.findOne.mockResolvedValueOnce(sourceTag).mockResolvedValueOnce(targetTag);

    mockDocumentTagRepo.find.mockRejectedValue(new Error('Document query failed'));

    await expect(service.mergeTags(sourceTagId, targetTagId)).rejects.toThrow(
      'Document query failed',
    );
  });

  it('should handle repository errors during tag deletion', async () => {
    const sourceTagId = 'source-tag';
    const targetTagId = 'target-tag';

    const sourceTag = { id: sourceTagId, name: 'Source' };
    const targetTag = { id: targetTagId, name: 'Target' };

    mockTagRepo.findOne.mockResolvedValueOnce(sourceTag).mockResolvedValueOnce(targetTag);

    mockDocumentTagRepo.find.mockResolvedValue([]);
    mockTagRepo.softDelete.mockRejectedValue(new Error('Tag deletion failed'));

    await expect(service.mergeTags(sourceTagId, targetTagId)).rejects.toThrow(
      'Tag deletion failed',
    );
  });
});
