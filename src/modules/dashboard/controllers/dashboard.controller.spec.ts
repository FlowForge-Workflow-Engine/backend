/**
 * Unit Tests: DashboardController
 * Module: dashboard
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - DashboardService: delegation and wrapper response
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "../services/dashboard.service";
import { DashboardStatsResponseDto } from "../dto/dashboard-stats-response.dto";

describe("DashboardController", () => {
  let controller: DashboardController;
  let dashboardService: jest.Mocked<DashboardService>;

  const tenantId = "aaaaaaaa-0000-4000-8000-000000000001";

  beforeEach(async () => {
    dashboardService = {
      getStats: jest.fn(),
    } as unknown as jest.Mocked<DashboardService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: dashboardService }],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  afterEach(() => jest.clearAllMocks());

  describe("getStats()", () => {
    it("should delegate to DashboardService.getStats() and wrap with {status:'success'}", async () => {
      const dto: DashboardStatsResponseDto = {
        totalWorkflows: 12,
        publishedWorkflows: 7,
        activeInstances: 19,
        totalUsers: 42,
      };

      dashboardService.getStats.mockResolvedValue(dto);

      const result = await controller.getStats(tenantId);

      expect(dashboardService.getStats).toHaveBeenCalledWith(tenantId);
      expect(result).toEqual({ status: "success", data: dto });
    });
  });
});

