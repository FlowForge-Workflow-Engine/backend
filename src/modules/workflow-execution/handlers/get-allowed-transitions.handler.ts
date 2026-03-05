import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import {
  IWorkflowQueryContract,
  WORKFLOW_QUERY_CONTRACT,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { WorkflowInstanceStatus } from "../entities/workflow-instance.entity";
import {
  AllowedTransition,
  GetAllowedTransitionsQuery,
  GetAllowedTransitionsResult,
} from "../queries/get-allowed-transitions.query";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";

@QueryHandler(GetAllowedTransitionsQuery)
export class GetAllowedTransitionsHandler implements IQueryHandler<
  GetAllowedTransitionsQuery,
  GetAllowedTransitionsResult
> {
  constructor(
    private readonly instanceRepo: WorkflowInstanceRepository,
    @Inject(WORKFLOW_QUERY_CONTRACT)
    private readonly workflowQuery: IWorkflowQueryContract,
    private readonly redis: RedisService
  ) {}

  async execute(query: GetAllowedTransitionsQuery): Promise<GetAllowedTransitionsResult> {
    const { instanceId, tenantId, userRoles } = query;

    const instance = await this.instanceRepo.findByIdAndTenant(instanceId, tenantId);
    if (!instance) throw new NotFoundException(AppErrors.WORKFLOW_INSTANCE_NOT_FOUND);
    if (instance.status !== WorkflowInstanceStatus.ACTIVE) return [];

    // Cache-aside: cache ALL transitions from current state, filter by role at read time
    const cacheKey = CacheKeys.allowedTransitions(tenantId, instanceId);
    let allTransitions = await this.redis.get<AllowedTransition[]>(cacheKey);

    if (!allTransitions) {
      const snapshot = await this.workflowQuery.getVersionSnapshot(
        instance.workflowDefinitionId,
        instance.definitionVersion,
        tenantId
      );
      if (!snapshot) return [];

      const transitions = (snapshot["transitions"] as any[]) ?? [];
      const states = (snapshot["states"] as any[]) ?? [];
      const stateMap = new Map<string, string>(states.map((s) => [s.id, s.name]));

      // Compute all transitions from the current state (before role filtering)
      allTransitions = transitions
        .filter((t) => t.fromStateId === instance.currentStateId)
        .map((t) => ({
          id: t.id,
          name: t.name,
          toStateId: t.toStateId,
          toStateName: stateMap.get(t.toStateId) ?? "",
          requiresComment: t.requiresComment ?? false,
          allowedRoleIds: t.allowedRoleIds as string[],
        }));

      await this.redis.set(cacheKey, allTransitions, CacheTTL.SHORT);
    }

    // Filter by current user's roles (cheap — done after cache hit)
    return (allTransitions as (AllowedTransition & { allowedRoleIds?: string[] })[]).filter(
      (t) => !t.allowedRoleIds || t.allowedRoleIds.some((r) => userRoles.includes(r))
    );
  }
}
