/**
 * Canonical JwtService mock.
 */
export const createMockJwtService = () => ({
  sign: jest.fn().mockReturnValue("mock.jwt.access.token"),
  verify: jest.fn().mockReturnValue({}),
  decode: jest.fn().mockReturnValue({}),
  signAsync: jest.fn().mockResolvedValue("mock.jwt.access.token"),
  verifyAsync: jest.fn().mockResolvedValue({}),
});

export type MockJwtService = ReturnType<typeof createMockJwtService>;

