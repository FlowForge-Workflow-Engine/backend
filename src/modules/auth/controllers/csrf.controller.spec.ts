import { Test, TestingModule } from "@nestjs/testing";
import { CsrfController } from "./csrf.controller";

describe("CsrfController", () => {
  let controller: CsrfController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CsrfController],
    }).compile();

    controller = module.get<CsrfController>(CsrfController);
  });

  afterEach(() => jest.clearAllMocks());

  describe("getCsrfToken()", () => {
    it("returns a success response containing the csrf token from req.csrfToken()", () => {
      const mockToken = "csrf-token-abc123";
      const req = { csrfToken: jest.fn().mockReturnValue(mockToken) } as any;

      const result = controller.getCsrfToken(req);

      expect(req.csrfToken).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        status: "success",
        data: { csrfToken: mockToken },
      });
    });

    it("calls req.csrfToken() each time and returns the fresh token", () => {
      const req = {
        csrfToken: jest
          .fn()
          .mockReturnValueOnce("first-token")
          .mockReturnValueOnce("second-token"),
      } as any;

      const result1 = controller.getCsrfToken(req);
      const result2 = controller.getCsrfToken(req);

      expect(result1.data.csrfToken).toBe("first-token");
      expect(result2.data.csrfToken).toBe("second-token");
      expect(req.csrfToken).toHaveBeenCalledTimes(2);
    });

    it("propagates errors thrown by req.csrfToken() (CSRF secret not set)", () => {
      const req = {
        csrfToken: jest.fn().mockImplementation(() => {
          throw new Error("invalid csrf token");
        }),
      } as any;

      expect(() => controller.getCsrfToken(req)).toThrow("invalid csrf token");
    });
  });
});

