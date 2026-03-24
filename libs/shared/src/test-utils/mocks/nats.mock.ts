/**
 * Canonical NatsConnection mock.
 * The raw nats NatsConnection is injected via NATS_CLIENT token.
 */
export const createMockNatsConnection = () => ({
  publish: jest.fn(),
  subscribe: jest.fn(),
  request: jest.fn(),
  flush: jest.fn().mockResolvedValue(undefined),
  drain: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  isClosed: jest.fn().mockReturnValue(false),
  isDraining: jest.fn().mockReturnValue(false),
  status: jest.fn(),
  info: {},
});

export type MockNatsConnection = ReturnType<typeof createMockNatsConnection>;

