import { Repository } from 'typeorm';
import DocumentTagEntity from '../../../../shared/infrastructure/database/entities/document-tag.entity.js';
import TagEntity from '../../../../shared/infrastructure/database/entities/tag.entity.js';
import { TagServiceImpl } from '../tag.service.js';

const mockReqContext = { userId: '1', ip: '127.0.0.1', userAgent: 'test-agent' } as any;

describe('TagServiceImpl - findAll', () => { 
  
  let service: TagServiceImpl;
  let tagRepo: Repository<TagEntity>;
  let documentTagRepo: Repository<DocumentTagEntity>;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn(),
  };

  const mockCountQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
  };

  const mockTagRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockDocumentTagRepo = {
    // Not needed for basic findAll tests
  };

  beforeEach(() => {
    // Reset and setup mock for each test
    mockTagRepo.createQueryBuilder.mockReset();
    // Service calls createQueryBuilder twice: first for main query, then for count query
    mockTagRepo.createQueryBuilder
      .mockReturnValueOnce(mockQueryBuilder) // First call for main query
      .mockReturnValueOnce(mockCountQueryBuilder); // Second call for count query

    service = new TagServiceImpl(mockTagRepo as any, mockDocumentTagRepo as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset query builder mocks
    Object.values(mockQueryBuilder).forEach((mock) => {
      if (typeof mock === 'function') {
        mock.mockClear();
        if (mock.mockReturnThis) {
          mock.mockReturnThis();
        }
      }
    });
  });

  it('should return paginated tags with usage counts', async () => {
    const mockTags = [
      {
        id: 'tag-1',
        name: 'Tag 1',
        colorHex: '#FF0000',
        description: 'Description 1',
        userId: 'user-1',
        usageCount: 5,
        lastUsedAt: new Date(),
      },
      {
        id: 'tag-2',
        name: 'Tag 2',
        colorHex: '#00FF00',
        description: 'Description 2',
        userId: 'user-1',
        usageCount: 3,
        lastUsedAt: null,
      },
    ];

    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: mockTags,
      raw: mockTags.map((tag) => ({ usageCount: tag.usageCount, lastUsedAt: tag.lastUsedAt })),
    });

    // Mock the separate count query
    mockTagRepo.createQueryBuilder.mockReturnValueOnce(mockCountQueryBuilder);
    mockCountQueryBuilder.getCount.mockResolvedValue(2);

    const result = await service.findAll(1, 10, undefined, 'user-1');

    expect(result.data).toEqual(mockTags);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(1);
  });

  it('should filter by user ID when provided', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID

    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [],
      raw: [],
    });

    mockTagRepo.createQueryBuilder.mockReturnValueOnce(mockCountQueryBuilder);
    mockCountQueryBuilder.getCount.mockResolvedValue(0);

    await service.findAll(1, 10, undefined, userId);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('tag.userId = :userId', { userId });
    expect(mockCountQueryBuilder.andWhere).toHaveBeenCalledWith('tag.userId = :userId', { userId });
  });

  it('should apply search filter', async () => {
    const searchTerm = 'urgent';

    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [],
      raw: [],
    });

    mockTagRepo.createQueryBuilder.mockReturnValueOnce(mockCountQueryBuilder);
    mockCountQueryBuilder.getCount.mockResolvedValue(0);

    await service.findAll(1, 10, searchTerm);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('tag.name LIKE :search', {
      search: `%${searchTerm}%`,
    });
    expect(mockCountQueryBuilder.andWhere).toHaveBeenCalledWith('tag.name LIKE :search', {
      search: `%${searchTerm}%`,
    });
  });

  it('should sort by usage count by default', async () => {
    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [],
      raw: [],
    });

    mockTagRepo.createQueryBuilder.mockReturnValueOnce(mockCountQueryBuilder);
    mockCountQueryBuilder.getCount.mockResolvedValue(0);

    await service.findAll(1, 10);

    expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('usageCount', 'DESC');
  });

  it('should sort alphabetically when specified', async () => {
    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [],
      raw: [],
    });

    mockTagRepo.createQueryBuilder.mockReturnValueOnce(mockCountQueryBuilder);
    mockCountQueryBuilder.getCount.mockResolvedValue(0);

    await service.findAll(1, 10, undefined, undefined, 'alphabetical');

    expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('tag.name', 'ASC');
  });

  it('should sort by recent when specified', async () => {
    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [],
      raw: [],
    });

    mockTagRepo.createQueryBuilder.mockReturnValueOnce(mockCountQueryBuilder);
    mockCountQueryBuilder.getCount.mockResolvedValue(0);

    await service.findAll(1, 10, undefined, undefined, 'recent');

    expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('tag.createdDate', 'DESC');
  });

  it('should handle pagination parameters', async () => {
    const page = 2;
    const limit = 25;

    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [],
      raw: [],
    });

    mockTagRepo.createQueryBuilder.mockReturnValueOnce(mockCountQueryBuilder);
    mockCountQueryBuilder.getCount.mockResolvedValue(100);

    const result = await service.findAll(page, limit);

    expect(mockQueryBuilder.skip).toHaveBeenCalledWith(25); // (page-1) * limit
    expect(mockQueryBuilder.take).toHaveBeenCalledWith(25);
    expect(result.totalPages).toBe(4); // Math.ceil(100/25)
  });

  it('should validate UUID format for user ID filtering', async () => {
    // Valid UUID
    mockQueryBuilder.getRawAndEntities.mockResolvedValueOnce({
      entities: [],
      raw: [],
    });
    mockTagRepo.createQueryBuilder.mockReturnValueOnce(mockCountQueryBuilder);
    mockCountQueryBuilder.getCount.mockResolvedValue(0);

    await service.findAll(1, 10, undefined, '550e8400-e29b-41d4-a716-446655440000');

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('tag.userId = :userId', {
      userId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('should skip user filtering for invalid UUID', async () => {
    // Invalid UUID - should not filter by user
    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [],
      raw: [],
    });

    mockTagRepo.createQueryBuilder.mockReturnValueOnce(mockCountQueryBuilder);
    mockCountQueryBuilder.getCount.mockResolvedValue(0);

    await service.findAll(1, 10, undefined, 'invalid-uuid');

    // Should not call andWhere for user filtering
    expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('tag.userId = :userId'),
      expect.any(Object),
    );
  });
});
