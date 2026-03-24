/**
 * Generic TypeORM repository mock factory.
 *
 * Covers the full TypeORM Repository<T> surface used across the codebase.
 * The createQueryBuilder chain supports where/andWhere/orderBy/skip/take
 * and all terminal methods (getManyAndCount, getMany, getOne, getCount).
 *
 * Usage:
 *   const mockUserRepo = createMockRepository();
 *   mockUserRepo.findOne.mockResolvedValue(MockAdminUser);
 */
export const createMockRepository = <T = unknown>() => ({
  find: jest.fn<Promise<T[]>, [unknown?]>(),
  findOne: jest.fn<Promise<T | null>, [unknown?]>(),
  findOneBy: jest.fn<Promise<T | null>, [unknown?]>(),
  findAndCount: jest.fn<Promise<[T[], number]>, [unknown?]>(),
  save: jest.fn<Promise<T>, [unknown]>(),
  create: jest.fn<T, [unknown?]>(),
  update: jest.fn(),
  delete: jest.fn(),
  softDelete: jest.fn(),
  count: jest.fn<Promise<number>, [unknown?]>(),
  exists: jest.fn<Promise<boolean>, [unknown?]>(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn<Promise<[T[], number]>, []>(),
    getMany: jest.fn<Promise<T[]>, []>(),
    getOne: jest.fn<Promise<T | null>, []>(),
    getCount: jest.fn<Promise<number>, []>(),
    getRawMany: jest.fn<Promise<unknown[]>, []>(),
    getRawOne: jest.fn<Promise<unknown>, []>(),
  })),
  manager: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
});

export type MockRepository<T = unknown> = ReturnType<typeof createMockRepository<T>>;

