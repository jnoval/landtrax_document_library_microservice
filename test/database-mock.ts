/**
 * Database mocking utilities for tests
 * Provides consistent database mocking across all test suites
 */

import { ObjectLiteral, Repository } from 'typeorm';

// Generic repository mock factory
export function createMockRepository<T extends ObjectLiteral>(): Repository<T> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    merge: jest.fn().mockImplementation((entity, dto) => Object.assign(entity, dto)),
    delete: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
    recover: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getOne: jest.fn().mockResolvedValue(null),
      getRawOne: jest.fn().mockResolvedValue(null),
      execute: jest.fn().mockResolvedValue(undefined),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
    }),
    manager: {
      query: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue(null),
      }),
    },
  } as any;
}

// Mock data factories for common entities
export const mockData = {
  createCompany: (overrides = {}) => ({
    id: 'company-1',
    name: 'Test Company',
    email: 'test@company.com',
    entityCode: 'CORP-2025-000001',
    businessRegistrationNumber: 'BRN-123456',
    taxIdentificationNumber: 'TIN-789012',
    createdBy: 'user-1',
    createdDate: new Date(),
    ...overrides,
  }),

  createUser: (overrides = {}) => ({
    id: 'user-1',
    email: 'user@test.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    ...overrides,
  }),

  createCollection: (overrides = {}) => ({
    id: 'collection-1',
    collectionNumber: 'PAY-2025-000001',
    amount: 500,
    currency: 'PHP',
    status: 'PENDING',
    userId: 'user-1',
    ...overrides,
  }),

  createCollectionMethod: (overrides = {}) => ({
    id: 'method-1',
    collectionId: 'collection-1',
    payTypeId: 'pay-type-1',
    amount: 500,
    createdBy: 'user-1',
    createdDate: new Date(),
    ...overrides,
  }),
};

// Mock response factories
export const mockResponses = {
  paginatedResult: (data: any[] = [], overrides = {}) => ({
    data,
    meta: {
      Total: data.length,
      Page: 1,
      Limit: 10,
      TotalPages: Math.ceil(data.length / 10),
      ...overrides,
    },
  }),

  successMessage: (message = 'Operation completed successfully', overrides = {}) => ({
    message,
    ...overrides,
  }),
};
