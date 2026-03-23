/**
 * Unit Tests: TransitionRuleRepository
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - TypeORM Repository<TransitionRule>: entityRepo mock
 * - RequestContextService: QR fallback (no CLS QueryRunner)
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { TransitionRuleRepository } from "./transition-rule.repository";
import { TransitionRule } from "../entities/transition-rule.entity";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { MockTransitionRule, TEST_IDS } from "@app/shared/test-utils";

describe("TransitionRuleRepository", () => {
  let repo: TransitionRuleRepository;
  let entityRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    remove: jest.Mock;
    target: typeof TransitionRule;
  };
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  beforeEach(async () => {
    entityRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve(entity)),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      target: TransitionRule,
    };
    requestContext = createMockRequestContextService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransitionRuleRepository,
        { provide: getRepositoryToken(TransitionRule), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<TransitionRuleRepository>(TransitionRuleRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findByTransitionId()", () => {
    it("orders by evaluationOrder ASC and filters by transitionId + tenantId", async () => {
      const found = [MockTransitionRule as unknown as TransitionRule];
      entityRepo.find.mockResolvedValue(found);

      const result = await repo.findByTransitionId(TEST_IDS.TRANSITION_ID, TEST_IDS.TENANT_A_ID);

      expect(entityRepo.find).toHaveBeenCalledWith({
        where: { transitionId: TEST_IDS.TRANSITION_ID, tenantId: TEST_IDS.TENANT_A_ID },
        order: { evaluationOrder: "ASC" },
      });
      expect(result).toEqual(found);
    });
  });

  describe("findByIdAndTenant()", () => {
    it("finds rule by id + tenantId", async () => {
      const found = MockTransitionRule as unknown as TransitionRule;
      entityRepo.findOne.mockResolvedValue(found);

      const result = await repo.findByIdAndTenant(TEST_IDS.RULE_ID, TEST_IDS.TENANT_A_ID);
      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { id: TEST_IDS.RULE_ID, tenantId: TEST_IDS.TENANT_A_ID },
      });
      expect(result).toEqual(found);
    });
  });

  describe("removeByTransitionIds()", () => {
    it("is a no-op when transitionIds is empty", async () => {
      await repo.removeByTransitionIds([], TEST_IDS.TENANT_A_ID);
      expect(entityRepo.delete).not.toHaveBeenCalled();
    });

    it("deletes rules by transitionId IN (...) and tenantId", async () => {
      entityRepo.delete.mockResolvedValue({ affected: 2 });
      const ids = [TEST_IDS.TRANSITION_ID, TEST_IDS.TRANSITION_ID_2];

      await repo.removeByTransitionIds(ids, TEST_IDS.TENANT_A_ID);

      expect(entityRepo.delete).toHaveBeenCalledTimes(1);
      const arg = entityRepo.delete.mock.calls[0][0];
      expect(arg).toEqual(
        expect.objectContaining({
          tenantId: TEST_IDS.TENANT_A_ID,
        })
      );
      expect(arg.transitionId).not.toBeNull();
      expect(typeof arg.transitionId).toBe("object");
    });
  });

  describe("removeByTransitionId()", () => {
    it("delegates to removeByTransitionIds([transitionId], tenantId)", async () => {
      entityRepo.delete.mockResolvedValue({ affected: 1 });

      await repo.removeByTransitionId(TEST_IDS.TRANSITION_ID, TEST_IDS.TENANT_A_ID);
      expect(entityRepo.delete).toHaveBeenCalledTimes(1);
    });
  });
});

