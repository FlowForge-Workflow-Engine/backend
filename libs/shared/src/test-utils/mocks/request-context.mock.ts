/**
 * Canonical RequestContextService mock (from @app/database).
 * Controls what getQueryRunner() returns so BaseRepository behaves predictably.
 */
export const createMockRequestContextService = () => ({
  getQueryRunner: jest.fn().mockReturnValue(undefined),
  setQueryRunner: jest.fn(),
  getTenantId: jest.fn().mockReturnValue(null),
  setTenantId: jest.fn(),
});

export type MockRequestContextService = ReturnType<typeof createMockRequestContextService>;

