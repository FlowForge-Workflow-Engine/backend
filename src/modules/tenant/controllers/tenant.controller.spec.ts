/**
 * Unit Tests: TenantController
 * Module: tenant
 * Coverage target: 85%+ line and branch
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { mockAdminJwt, MockFeatureFlag, MockTenant, MockTenantSettings, TEST_IDS } from "@app/shared/test-utils";
import { TenantController } from "./tenant.controller";
import { TenantService } from "../services/tenant.service";
import { FindTenantDto } from "../dto/find-tenant.dto";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { UpdateTenantDto } from "../dto/update-tenant.dto";
import { UpdateTenantSettingsDto } from "../dto/update-tenant-settings.dto";
import { CreateFeatureFlagDto } from "../dto/create-feature-flag.dto";
import { UpdateFeatureFlagDto } from "../dto/update-feature-flag.dto";
import { TenantPlan } from "../entities/tenant.entity";

describe("TenantController", () => {
  let controller: TenantController;
  let service: jest.Mocked<TenantService>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
      getFeatureFlags: jest.fn(),
      createFeatureFlag: jest.fn(),
      updateFeatureFlag: jest.fn(),
      deleteFeatureFlag: jest.fn(),
      verifyUserBelongsToTenant: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<TenantService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [{ provide: TenantService, useValue: service }],
    }).compile();

    controller = module.get<TenantController>(TenantController);
  });

  afterEach(() => jest.clearAllMocks());

  it("findAll returns wrapped response with count", async () => {
    const dto: FindTenantDto = { page: 1, limit: 10 };
    service.findAll.mockResolvedValue({ data: [MockTenant as never], total: 1 });

    const result = await controller.findAll(dto);
    expect(service.findAll).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ status: "success", count: 1, data: [MockTenant] });
  });

  it("findOne delegates to service.findById", async () => {
    const idParam: IdParamDto = { id: TEST_IDS.TENANT_A_ID };
    service.findById.mockResolvedValue(MockTenant as never);

    const result = await controller.findOne(idParam);
    expect(service.findById).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID);
    expect(result).toEqual({ status: "success", data: MockTenant });
  });

  it("update delegates with current user tenantId", async () => {
    const idParam: IdParamDto = { id: TEST_IDS.TENANT_A_ID };
    const dto: UpdateTenantDto = { plan: TenantPlan.PRO };
    service.update.mockResolvedValue(MockTenant as never);

    const result = await controller.update(idParam, dto, mockAdminJwt);
    expect(service.update).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID, mockAdminJwt.tenantId, dto);
    expect(result.status).toBe("success");
  });

  it("deactivate delegates and returns void", async () => {
    const idParam: IdParamDto = { id: TEST_IDS.TENANT_A_ID };
    service.deactivate.mockResolvedValue(MockTenant as never);

    const result = await controller.deactivate(idParam, mockAdminJwt);
    expect(service.deactivate).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID, mockAdminJwt.tenantId);
    expect(result).toBeUndefined();
  });

  it("getSettings delegates and wraps", async () => {
    const idParam: IdParamDto = { id: TEST_IDS.TENANT_A_ID };
    service.getSettings.mockResolvedValue(MockTenantSettings as never);

    const result = await controller.getSettings(idParam);
    expect(service.getSettings).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID);
    expect(result).toEqual({ status: "success", data: MockTenantSettings });
  });

  it("updateSettings delegates with current user tenantId", async () => {
    const idParam: IdParamDto = { id: TEST_IDS.TENANT_A_ID };
    const dto: UpdateTenantSettingsDto = { maxUsers: 100 };
    service.updateSettings.mockResolvedValue(MockTenantSettings as never);

    const result = await controller.updateSettings(idParam, dto, mockAdminJwt);
    expect(service.updateSettings).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID, mockAdminJwt.tenantId, dto);
    expect(result.status).toBe("success");
  });

  it("feature flags endpoints delegate correctly", async () => {
    const idParam: IdParamDto = { id: TEST_IDS.TENANT_A_ID };
    const createDto: CreateFeatureFlagDto = {
      flagKey: "advanced_reporting",
      isEnabled: true,
      config: null,
    };
    const updateDto: UpdateFeatureFlagDto = { isEnabled: false };

    service.getFeatureFlags.mockResolvedValue([MockFeatureFlag as never]);
    service.createFeatureFlag.mockResolvedValue(MockFeatureFlag as never);
    service.updateFeatureFlag.mockResolvedValue(MockFeatureFlag as never);
    service.deleteFeatureFlag.mockResolvedValue(undefined);

    const listResult = await controller.getFeatureFlags(idParam);
    expect(listResult).toEqual({
      status: "success",
      count: 1,
      data: [MockFeatureFlag],
    });

    await controller.createFeatureFlag(idParam, createDto, mockAdminJwt);
    expect(service.createFeatureFlag).toHaveBeenCalledWith(
      TEST_IDS.TENANT_A_ID,
      mockAdminJwt.tenantId,
      createDto
    );

    await controller.updateFeatureFlag(idParam, "advanced_reporting", updateDto, mockAdminJwt);
    expect(service.updateFeatureFlag).toHaveBeenCalledWith(
      TEST_IDS.TENANT_A_ID,
      mockAdminJwt.tenantId,
      "advanced_reporting",
      updateDto
    );

    const deleted = await controller.deleteFeatureFlag(idParam, "advanced_reporting", mockAdminJwt);
    expect(service.deleteFeatureFlag).toHaveBeenCalledWith(
      TEST_IDS.TENANT_A_ID,
      mockAdminJwt.tenantId,
      "advanced_reporting"
    );
    expect(deleted).toBeUndefined();
  });
});

