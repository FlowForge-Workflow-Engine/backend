import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import {
  IWorkflowQueryContract,
  WORKFLOW_QUERY_CONTRACT,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import {
  AllowedTransition,
  GetAllowedTransitionsQuery,
  GetAllowedTransitionsResult,
} from "../queries/get-allowed-transitions.query";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

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
    const { instanceId, tenantId, userRoleIds } = query;

    // Step 1: Load the instance and ensure it exists and is still active
    const instance = await this.instanceRepo.findByIdAndTenant(instanceId, tenantId);
    if (!instance) throw new NotFoundException(AppErrors.WORKFLOW_INSTANCE_NOT_FOUND);
    if (instance.status !== WorkflowInstanceStatus.ACTIVE) return [];
    // console.log({ instance });

    // Step 2: Use a cache-aside strategy for all transitions from the current state
    // Role filtering remains a cheap read-time operation after cache retrieval.
    const cacheKey = CacheKeys.allowedTransitions(tenantId, instanceId);
    let allTransitions = await this.redis.get<AllowedTransition[]>(cacheKey);

    if (!allTransitions) {
      // Step 3: Load the immutable definition snapshot when the cache misses
      const snapshot = await this.workflowQuery.getVersionSnapshot(
        instance.workflowDefinitionId,
        instance.definitionVersion,
        tenantId
      );
      if (!snapshot) return [];

      const transitions = (snapshot["transitions"] as any[]) ?? [];
      const states = (snapshot["states"] as any[]) ?? [];
      // Build a state-id lookup map for efficient target-state name resolution.
      const stateMap = new Map<string, string>(states.map((s) => [s.id, s.name]));

      // Step 4: Compute every transition available from the current state before role filtering
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

      // Step 5: Cache the transition list with a short TTL because it changes after transitions
      await this.redis.set(cacheKey, allTransitions, CacheTTL.SHORT);
    }

    // console.log({ userRoleIds, allTransitions });

    // Step 6: Filter the cached transition set by the current user's roles
    return (allTransitions as (AllowedTransition & { allowedRoleIds?: string[] })[]).filter((t) => {
      const allowedRoleIds = t.allowedRoleIds ?? [];
      return allowedRoleIds.length === 0 || allowedRoleIds.some((roleId) => userRoleIds.includes(roleId));
    });
  }
}
