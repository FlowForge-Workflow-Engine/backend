/**
 * Canonical RedisService mock.
 * Call createMockRedisService() inside each describe block to get a fresh instance.
 */
export const createMockRedisService = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  setNX: jest.fn().mockResolvedValue(true),
  exists: jest.fn().mockResolvedValue(false),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(undefined),
  delByPattern: jest.fn().mockResolvedValue(undefined),
  getClient: jest.fn(),
});

export type MockRedisService = ReturnType<typeof createMockRedisService>;

