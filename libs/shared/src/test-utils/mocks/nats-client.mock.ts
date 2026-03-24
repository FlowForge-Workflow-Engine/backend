/**
 * Canonical NestJS ClientProxy (NATS transport) mock.
 *
 * Use this when the class under test injects a ClientProxy via
 *   @Inject(NATS_SERVICE) private readonly client: ClientProxy
 *
 * The `toPromise()` chain is stubbed so callers can `await client.emit(...).toPromise()`.
 *
 * For raw NatsConnection (used in custom publishers via the 'nats' package directly),
 * use createMockNatsConnection() from nats.mock.ts instead.
 */
export const createMockNatsClient = () => ({
  emit: jest.fn().mockReturnValue({
    toPromise: jest.fn().mockResolvedValue(undefined),
  }),
  send: jest.fn().mockReturnValue({
    toPromise: jest.fn().mockResolvedValue(undefined),
  }),
  publish: jest.fn().mockResolvedValue(undefined),
  connect: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
});

export type MockNatsClient = ReturnType<typeof createMockNatsClient>;

