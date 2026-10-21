import { IsNull, Repository } from 'typeorm';
import DocumentTagEntity from '../../../../shared/infrastructure/database/entities/document-tag.entity.js';
import TagEntity from '../../../../shared/infrastructure/database/entities/tag.entity.js';
import { CreateTagDto } from '../../dtos/create-tag.dto.js';
import { TagServiceImpl } from '../tag.service.js';

const mockReqContext = { userId: '1', ip: '127.0.0.1', userAgent: 'test-agent' } as any;

describe('TagServiceImpl - create', () => { 
  
  let service: TagServiceImpl;
  let tagRepo: Repository<TagEntity>;
  let documentTagRepo: Repository<DocumentTagEntity>;

  const mockTagRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDocumentTagRepo = {
    // Not needed for create tests
  };

  beforeEach(() => {
    service = new TagServiceImpl(mockTagRepo as any, mockDocumentTagRepo as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create and save a new tag with default color', async () => {
    const createDto: CreateTagDto = {
      name: 'Test Tag',
      description: 'Test description',
    };

    const userId = 'user-uuid';
    const mockCreatedTag = { ...createDto };
    const mockSavedTag = {
      id: 'tag-uuid',
      ...createDto,
      colorHex: '#3B82F6',
      userId,
      createdBy: userId,
    };

    mockTagRepo.findOne.mockResolvedValue(null);
    mockTagRepo.create.mockReturnValue(mockCreatedTag);
    mockTagRepo.save.mockResolvedValue(mockSavedTag);

    const result = await service.create(createDto, userId);

    expect(mockTagRepo.findOne).toHaveBeenCalledWith({
      where: {
        name: createDto.name,
        userId,
        deletedDate: IsNull(),
      },
    });
    expect(mockTagRepo.create).toHaveBeenCalled();
    expect(mockTagRepo.save).toHaveBeenCalledWith(mockCreatedTag);
    expect(result).toEqual(mockSavedTag);
  });

  it('should create tag with custom color', async () => {
    const createDto: CreateTagDto = {
      name: 'Colored Tag',
      colorHex: '#FF0000',
    };

    const userId = 'user-uuid';
    const mockSavedTag = {
      id: 'tag-uuid',
      ...createDto,
      userId,
      createdBy: userId,
    };

    mockTagRepo.findOne.mockResolvedValue(null);
    mockTagRepo.create.mockReturnValue({ ...createDto });
    mockTagRepo.save.mockResolvedValue(mockSavedTag);

    const result = await service.create(createDto, userId);

    expect(result.colorHex).toBe('#FF0000');
  });

  it('should throw BadRequestException if tag name already exists', async () => {
    const createDto: CreateTagDto = {
      name: 'Existing Tag',
    };

    const userId = 'user-uuid';
    const existingTag = { id: 'existing-id', name: 'Existing Tag' };

    mockTagRepo.findOne.mockResolvedValue(existingTag);

    await expect(service.create(createDto, userId)).rejects.toThrow(
      'A tag with name "Existing Tag" already exists',
    );

    expect(mockTagRepo.findOne).toHaveBeenCalledWith({
      where: {
        name: createDto.name,
        userId,
        deletedDate: IsNull(),
      },
    });
    expect(mockTagRepo.create).not.toHaveBeenCalled();
    expect(mockTagRepo.save).not.toHaveBeenCalled();
  });

  it('should handle repository save error', async () => {
    const createDto: CreateTagDto = {
      name: 'Error Tag',
    };

    const userId = 'user-uuid';
    const mockCreatedTag = { ...createDto };

    mockTagRepo.findOne.mockResolvedValue(null);
    mockTagRepo.create.mockReturnValue(mockCreatedTag);
    mockTagRepo.save.mockRejectedValue(new Error('Database error'));

    await expect(service.create(createDto, userId)).rejects.toThrow('Database error');
  });

  it('should create tags with different user IDs', async () => {
    const createDto: CreateTagDto = {
      name: 'Shared Name Tag',
    };

    const users = ['user-1', 'user-2', 'user-3'];

    for (const userId of users) {
      mockTagRepo.findOne.mockResolvedValue(null);
      mockTagRepo.create.mockReturnValue({ ...createDto });
      mockTagRepo.save.mockResolvedValue({
        id: `tag-${userId}`,
        ...createDto,
        userId,
        createdBy: userId,
      });

      const result = await service.create(createDto, userId);

      expect(result.userId).toBe(userId);
      expect(result.createdBy).toBe(userId);
    }
  });
});
