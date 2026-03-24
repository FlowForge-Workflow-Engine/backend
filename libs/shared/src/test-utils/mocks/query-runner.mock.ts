/**
 * Canonical TypeORM QueryRunner + EntityManager mock.
 * Used when testing code that manually manages QueryRunners (JwtStrategy, deleteOldTokens, etc).
 */
export const createMockEntityManager = () => ({
  getRepository: jest.fn(),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockImplementation((entity: unknown) => Promise.resolve(entity)),
  query: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getMany: jest.fn(),
    getOne: jest.fn(),
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
  })),
});

export const createMockQueryRunner = (overrides: Partial<ReturnType<typeof _buildQR>> = {}) => {
  return { ..._buildQR(), ...overrides };
};

function _buildQR() {
  const manager = createMockEntityManager();
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
    manager,
    isReleased: false,
    isTransactionActive: true,
  };
}

export type MockQueryRunner = ReturnType<typeof createMockQueryRunner>;
export type MockEntityManager = ReturnType<typeof createMockEntityManager>;
