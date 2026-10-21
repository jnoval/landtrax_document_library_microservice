import { IsNull, Repository } from 'typeorm';
import DocumentTagEntity from '../../../../shared/infrastructure/database/entities/document-tag.entity.js';
import TagEntity from '../../../../shared/infrastructure/database/entities/tag.entity.js';
import { UpdateTagDto } from '../../dtos/update-tag.dto.js';
import { TagServiceImpl } from '../tag.service.js';

const mockReqContext = { userId: '1', ip: '127.0.0.1', userAgent: 'test-agent' } as any;

describe('TagServiceImpl - update', () => { 
  
  let service: TagServiceImpl;
  let tagRepo: Repository<TagEntity>;
  let documentTagRepo: Repository<DocumentTagEntity>;

  const mockTagRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockDocumentTagRepo = {
    // Not needed for update tests
  };

  beforeEach(() => {
    service = new TagServiceImpl(mockTagRepo as any, mockDocumentTagRepo as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockTagRepo.findOne.mockReset();
    mockTagRepo.save.mockReset();
  });

  it('should update tag fields successfully', async () => {
    const tagId = 'tag-uuid';
    const userId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID
    const updateDto: UpdateTagDto = {
      name: 'Updated Tag Name',
      colorHex: '#00FF00',
      description: 'Updated description',
    };

    const existingTag = {
      id: tagId,
      name: 'Original Tag',
      colorHex: '#FF0000',
      description: 'Original description',
      userId,
    };

    const updatedTag = {
      ...existingTag,
      ...updateDto,
      updatedBy: userId,
    };

    mockTagRepo.findOne
      .mockResolvedValueOnce(existingTag) // First call: find tag to update
      .mockResolvedValueOnce(null); // Second call: check for duplicate name (none found)
    mockTagRepo.save.mockResolvedValue(updatedTag);

    const result = await service.update(tagId, updateDto, userId);

    expect(mockTagRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: tagId,
        deletedDate: IsNull(),
        userId,
      },
    });
    expect(mockTagRepo.save).toHaveBeenCalledWith(existingTag);
    expect(result.name).toBe('Updated Tag Name');
    expect(result.colorHex).toBe('#00FF00');
    expect(result.description).toBe('Updated description');
  });
  it('should validate user ownership', async () => {
    const tagId = 'tag-uuid';
    const wrongUserId = 'wrong-user';

    mockTagRepo.findOne.mockResolvedValue(null); // Not found for wrong user

    await expect(service.update(tagId, { name: 'New Name' }, wrongUserId)).rejects.toThrow(
      `Tag with ID ${tagId} not found`,
    );
  });

  it('should throw BadRequestException when renaming to existing tag name', async () => {
    const tagId = 'tag-uuid';
    const userId = 'user-uuid';
    const updateDto: UpdateTagDto = {
      name: 'Existing Tag Name',
    };

    const existingTag = {
      id: tagId,
      name: 'Original Name',
      userId,
    };

    const conflictingTag = {
      id: 'other-tag-id',
      name: 'Existing Tag Name',
      userId,
    };

    mockTagRepo.findOne.mockResolvedValueOnce(existingTag); // First call finds the tag to update
    mockTagRepo.findOne.mockResolvedValueOnce(conflictingTag); // Second call finds conflicting tag

    await expect(service.update(tagId, updateDto, userId)).rejects.toThrow(
      'A tag with name "Existing Tag Name" already exists',
    );
  });

  it('should allow renaming to same name (no change)', async () => {
    const tagId = 'tag-uuid';
    const userId = 'user-uuid';
    const updateDto: UpdateTagDto = {
      name: 'Same Name', // Same as current name
    };

    const existingTag = {
      id: tagId,
      name: 'Same Name',
      userId,
    };

    mockTagRepo.findOne.mockResolvedValueOnce(existingTag); // Tag to update
    mockTagRepo.findOne.mockResolvedValueOnce(null); // No conflicting tag found
    mockTagRepo.save.mockResolvedValue(existingTag);

    const result = await service.update(tagId, updateDto, userId);

    expect(result.name).toBe('Same Name');
  });

  it('should handle partial updates (only some fields)', async () => {
    const tagId = 'tag-uuid';
    const updateDto: UpdateTagDto = {
      colorHex: '#0000FF', // Only update color
    };

    const existingTag = {
      id: tagId,
      name: 'Tag Name',
      colorHex: '#FF0000',
      description: 'Description',
      userId: 'user-uuid',
    };

    const updatedTag = {
      ...existingTag,
      colorHex: '#0000FF',
      updatedBy: 'user-uuid',
    };

    mockTagRepo.findOne.mockResolvedValue(existingTag); // Only one call since name doesn't change
    mockTagRepo.save.mockResolvedValue(updatedTag);

    const result = await service.update(tagId, updateDto);

    expect(result.name).toBe('Tag Name'); // Unchanged
    expect(result.colorHex).toBe('#0000FF'); // Updated
    expect(result.description).toBe('Description'); // Unchanged
  });

  it('should skip user filtering when userId is invalid UUID', async () => {
    const tagId = 'tag-uuid';
    const invalidUserId = 'invalid-user-id';

    const existingTag = {
      id: tagId,
      name: 'Tag',
      userId: 'some-user',
    };

    mockTagRepo.findOne
      .mockResolvedValueOnce(existingTag) // First call: find tag to update (without userId filter)
      .mockResolvedValueOnce(null); // Second call: check for duplicate name (none found)
    mockTagRepo.save.mockResolvedValue(existingTag);

    await service.update(tagId, { name: 'New Name' }, invalidUserId);

    // Should find tag without user filtering
    expect(mockTagRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: tagId,
        deletedDate: IsNull(),
        // No userId filter since invalid UUID
      },
    });
  });

  it('should handle repository save error', async () => {
    const tagId = 'tag-uuid';
    const existingTag = {
      id: tagId,
      name: 'Tag',
    };

    mockTagRepo.findOne
      .mockResolvedValueOnce(existingTag) // First call: find tag to update
      .mockResolvedValueOnce(null); // Second call: check for duplicate name (none found)
    mockTagRepo.save.mockRejectedValue(new Error('Database error'));

    await expect(service.update(tagId, { name: 'New Name' })).rejects.toThrow('Database error');
  });
});
