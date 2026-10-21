import { TagServiceImpl } from '../tag.service.js';

describe('TagServiceImpl - findOne', () => {
  let service: TagServiceImpl;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn(),
  };

  const mockTagRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockDocumentTagRepo = {
    // Not needed for findOne tests
  };

  beforeEach(() => {
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

  it('should return tag with usage count when found', async () => {
    const tagId = 'tag-uuid';
    const userId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID

    const mockTag = {
      id: tagId,
      name: 'Test Tag',
      colorHex: '#FF0000',
      description: 'Test description',
      userId,
    };

    const rawResult = {
      usageCount: 5,
      lastUsedAt: new Date('2023-01-01'),
    };

    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [mockTag],
      raw: [rawResult],
    });

    const result = await service.findOne(tagId, userId);

    expect(result).toEqual({
      ...mockTag,
      usageCount: 5,
      lastUsedAt: new Date('2023-01-01'),
    });
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('tag.id = :id', { id: tagId });
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('tag.userId = :userId', { userId });
  });

  it('should return tag with zero usage count', async () => {
    const tagId = 'unused-tag-uuid';

    const mockTag = {
      id: tagId,
      name: 'Unused Tag',
      colorHex: '#000000',
      userId: 'user-uuid',
    };

    const rawResult = {
      usageCount: 0,
      lastUsedAt: null,
    };

    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [mockTag],
      raw: [rawResult],
    });

    const result = await service.findOne(tagId);

    expect(result.usageCount).toBe(0);
    expect(result.lastUsedAt).toBeNull();
  });

  it('should filter by user ID when provided', async () => {
    const tagId = 'tag-uuid';
    const userId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID

    const mockTag = {
      id: tagId,
      name: 'User Tag',
      userId,
    };

    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [mockTag],
      raw: [{ usageCount: 1, lastUsedAt: null }],
    });

    await service.findOne(tagId, userId);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('tag.userId = :userId', { userId });
  });

  it('should skip user filtering when userId is not a valid UUID', async () => {
    const tagId = 'tag-uuid';
    const invalidUserId = 'invalid-user-id';

    const mockTag = {
      id: tagId,
      name: 'Tag',
    };

    mockQueryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [mockTag],
      raw: [{ usageCount: 1, lastUsedAt: null }],
    });

    await service.findOne(tagId, invalidUserId);

    // Should not filter by user since it's not a valid UUID
    expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
      'tag.userId = :userId',
      expect.any(Object),
    );
  });
  it('should handle repository query error', async () => {
    const tagId = 'tag-uuid';

    mockQueryBuilder.getRawAndEntities.mockRejectedValue(new Error('Database error'));

    await expect(service.findOne(tagId)).rejects.toThrow('Database error');
  });

  it('should return different usage counts correctly', async () => {
    const testCases = [
      { usageCount: 0, lastUsedAt: null },
      { usageCount: 1, lastUsedAt: new Date('2023-01-01') },
      { usageCount: 10, lastUsedAt: new Date('2023-12-31') },
    ];

    for (const testCase of testCases) {
      const mockTag = {
        id: 'test-tag',
        name: 'Test Tag',
      };

      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [mockTag],
        raw: [testCase],
      });

      const result = await service.findOne('test-tag');

      expect(result.usageCount).toBe(testCase.usageCount);
      expect(result.lastUsedAt).toEqual(testCase.lastUsedAt);
    }
  });
});
