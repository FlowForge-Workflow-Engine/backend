/**
 * Canonical ConfigService mock.
 * Pass an overrides map to control specific config values.
 */
export const createMockConfigService = (overrides: Record<string, unknown> = {}) => ({
  get: jest.fn((key: string, defaultValue?: unknown) => {
    if (key in overrides) return overrides[key];
    return defaultValue;
  }),
  getOrThrow: jest.fn((key: string) => {
    if (key in overrides) return overrides[key];
    throw new Error(`Config key "${key}" not found`);
  }),
});

export type MockConfigService = ReturnType<typeof createMockConfigService>;

