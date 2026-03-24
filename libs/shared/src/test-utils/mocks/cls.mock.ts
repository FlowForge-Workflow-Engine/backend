import { createMockQueryRunner } from './query-runner.mock';

/**
 * Canonical ClsService mock (nestjs-cls).
 *
 * Pre-populates the store with a QueryRunner under the 'queryRunner' key
 * so that repositories that call `this.cls.get('queryRunner')` receive
 * a fully-mocked QueryRunner without extra setup.
 *
 * Usage in tests:
 *   const mockCls = createMockClsService();
 *   const { _mockQueryRunner } = mockCls;
 *   _mockQueryRunner.manager.find.mockResolvedValue([...]);
 */
export const createMockClsService = () => {
  const store = new Map<string, unknown>();
  const qr = createMockQueryRunner();
  store.set('queryRunner', qr);

  return {
    get: jest.fn((key: string) => store.get(key)),
    set: jest.fn((key: string, value: unknown) => store.set(key, value)),
    run: jest.fn((fn: () => unknown) => fn()),
    /** Exposed for direct assertion in tests — e.g. _mockQueryRunner.manager.save */
    _mockQueryRunner: qr,
  };
};

export type MockClsService = ReturnType<typeof createMockClsService>;

