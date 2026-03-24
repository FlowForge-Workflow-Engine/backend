export const mockMailerService = {
  sendMail: jest.fn().mockResolvedValue({ messageId: "test-message-id" }),
};

export const mockConfigValues: Record<string, unknown> = {
  NODE_ENV: "test",
  STAGE: "test",
  PORT: 3001,
  DB_HOST: "localhost",
  DB_PORT: 5432,
  DB_USER: "workflow_app",
  DB_PASSWORD: "workflow-password",
  DATABASE: "workflow-engine-test",
  JWT_SECRET: "test-only-secret-never-use-in-production",
  JWT_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRY_DAYS: 7,
  THROTTLE_TTL: 60000,
  THROTTLE_LIMIT: 999999,
  REDIS_URL: "redis://localhost:6379",
  NATS_URL: "nats://localhost:4222",
};

export const mockConfigService = {
  get: jest.fn((key: string) => mockConfigValues[key]),
};
