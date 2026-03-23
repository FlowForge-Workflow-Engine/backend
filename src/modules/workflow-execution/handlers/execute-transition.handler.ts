import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import {
  IRuleEngineContract,
  RULE_ENGINE_CONTRACT,
} from "@app/shared/interfaces/contracts/rule-engine.contract";
import { generateUUID } from "@app/shared/utils/uuid.util";
import {
  IWorkflowQueryContract,
  WORKFLOW_QUERY_CONTRACT,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { WorkflowInstance } from "../entities/workflow-instance.entity";
import { ExecutionPublisher } from "../publishers/execution.publisher";
import { ExecuteTransitionCommand } from "../commands/execute-transition.command";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";
import { DBVariables } from "@app/database/constants/db-variables.enum";

@CommandHandler(ExecuteTransitionCommand)
export class ExecuteTransitionHandler implements ICommandHandler<ExecuteTransitionCommand> {
  private readonly logger = new Logger(ExecuteTransitionHandler.name);
  constructor(
    private readonly instanceRepo: WorkflowInstanceRepository,
    @Inject(WORKFLOW_QUERY_CONTRACT)
    private readonly workflowQuery: IWorkflowQueryContract,
    @Inject(RULE_ENGINE_CONTRACT)
    private readonly ruleEngine: IRuleEngineContract,
    private readonly dataSource: DataSource,
    private readonly publisher: ExecutionPublisher,
    private readonly redis: RedisService
  ) {}

  async execute(command: ExecuteTransitionCommand): Promise<WorkflowInstance> {
    const { instanceId, transitionId, lastKnownVersion, comment, actor, idempotencyKey } = command;
    const tenantId = actor.tenantId;

    // ─── IDEMPOTENCY CHECK ────────────────────────────────────────────────────
    // Prevent duplicate transitions when the same request is retried.
    if (idempotencyKey) {
      const idempotencyCache = CacheKeys.transitionIdempotency(tenantId, idempotencyKey);
      // If the transition already completed for this key, return the cached result.
      const existing = await this.redis.get<WorkflowInstance>(idempotencyCache);
      if (existing) return existing;

      // Acquire a short-lived lock so the same idempotent request cannot run concurrently.
      const lockKey = `${idempotencyCache}:lock`;
      const claimed = await this.redis.setNX(lockKey, actor.sub, 30);
      if (!claimed) throw new ConflictException("DUPLICATE_REQUEST_IN_FLIGHT");
    }

    // Step 1: Load and validate the workflow instance
    const instance = await this.instanceRepo.findByIdAndTenant(instanceId, tenantId);

    if (!instance) throw new NotFoundException(AppErrors.WORKFLOW_INSTANCE_NOT_FOUND);
    if (instance.status !== WorkflowInstanceStatus.ACTIVE) {
      throw new UnprocessableEntityException(AppErrors.WORKFLOW_INSTANCE_NOT_ACTIVE);
    }
    if (instance.version !== lastKnownVersion) {
      throw new ConflictException(AppErrors.TRANSITION_CONFLICT);
    }

    // Step 2: Load the immutable definition snapshot used by this instance version
    const snapshot = await this.workflowQuery.getVersionSnapshot(
      instance.workflowDefinitionId,
      instance.definitionVersion,
      tenantId
    );
    if (!snapshot) throw new NotFoundException(AppErrors.DEFINITION_VERSION_NOT_FOUND);

    const transitions = (snapshot["transitions"] as any[]) ?? [];
    const states = (snapshot["states"] as any[]) ?? [];

    // Step 3: Find the requested transition and ensure it starts from the current state
    const transition = transitions.find(
      (t) => t.id === transitionId && t.fromStateId === instance.currentStateId
    );
    if (!transition) throw new NotFoundException(AppErrors.TRANSITION_NOT_ALLOWED);

    // Step 4: Validate role access for this transition
    // Empty allowedRoleIds means the transition is open to all roles.
    const allowedRoleIds = Array.isArray(transition.allowedRoleIds)
      ? (transition.allowedRoleIds as string[])
      : [];
    const hasRole =
      allowedRoleIds.length === 0 || actor.roleIds.some((roleId) => allowedRoleIds.includes(roleId));
    if (!hasRole) throw new ForbiddenException(AppErrors.TRANSITION_ROLE_FORBIDDEN);

    // Step 5: Enforce comment requirement for transitions that demand user justification
    // check if comment is necessary and comment should NOT be empty or whitespace
    if (transition.requiresComment && !comment?.trim()) {
      throw new UnprocessableEntityException(AppErrors.COMMENT_REQUIRED);
    }

    // Step 6: Evaluate business rules against instance payload and actor context
    if (transition.rules?.length > 0) {
      const result = await this.ruleEngine.evaluateRules(transition.rules, {
        payload: instance.payload,
        user: { id: actor.sub, role: actor.roles[0] ?? "", roles: actor.roles },
        instance: { currentState: instance.currentStateName, createdAt: instance.createdAt.toISOString() },
      });
      if (!result.passed) {
        throw new UnprocessableEntityException({
          errorCode: AppErrors.TRANSITION_RULES_FAILED,
          failedRules: result.failedRules,
        });
      }
    }

    // Step 7: Resolve the destination state and determine the resulting instance status
    const toState = states.find((s) => s.id === transition.toStateId);
    if (!toState) throw new NotFoundException(AppErrors.WORKFLOW_STATE_NOT_FOUND);

    const isTerminal: boolean = toState.isTerminal === true;
    const newStatus = isTerminal ? WorkflowInstanceStatus.COMPLETED : WorkflowInstanceStatus.ACTIVE;
    const eventId = generateUUID();

    // Step 8: Perform the state change atomically with optimistic locking
    await this.dataSource.transaction(async (em) => {
      // Update the instance only if the caller's last known version still matches.
      // ✅ Set tenant context for RLS
      this.logger.debug(
        `DB Context → Setting tenant_id to ${tenantId} for RLS for Atomic Workflow-Instance Update`
      );

      em.query(`SELECT set_config('${DBVariables.APP_TENANT_ID}', $1::text, true)`, [tenantId]);
      const result = await em.query(
        `UPDATE workflow_instances
         SET current_state_id = $1, current_state_name = $2, version = version + 1,
             status = $3, completed_at = $4, updated_at = NOW()
         WHERE id = $5 AND version = $6 AND tenant_id = $7`,
        [
          toState.id,
          toState.name,
          newStatus,
          isTerminal ? new Date() : null,
          instanceId,
          lastKnownVersion,
          tenantId,
        ]
      );

      // No rows updated means another writer already changed the instance version.
      if (result[1] === 0) {
        throw new ConflictException(AppErrors.TRANSITION_CONFLICT);
      }
    });

    // Step 9: Invalidate caches whose values changed because of the transition
    await Promise.allSettled([
      this.redis.del(CacheKeys.allowedTransitions(tenantId, instanceId)),
      this.redis.del(CacheKeys.instanceDetail(tenantId, instanceId)),
    ]);

    // Step 10: Reload the updated instance and publish domain events
    const updated = await this.instanceRepo.findByIdAndTenant(instanceId, tenantId);

    // Publish the transition-completed event for consumers such as audit/notifications.
    this.publisher.publishTransitionCompleted({
      eventId,
      tenantId,
      instanceId,
      workflowDefinitionId: instance.workflowDefinitionId,
      fromState: instance.currentStateName,
      toState: toState.name,
      transitionId,
      transitionName: transition.name,
      performedByUserId: actor.sub,
      performedByEmail: actor.email,
      performedByRole: actor.roles[0] ?? "",
      comment,
      instancePayload: updated!.payload,
      occurredAt: new Date().toISOString(),
    });

    // If the destination state is terminal, also emit a completion event.
    if (isTerminal) {
      this.publisher.publishInstanceCompleted({
        eventId: generateUUID(),
        tenantId,
        instanceId,
        performedByUserId: actor.sub,
        performedByEmail: actor.email,
        performedByRole: actor.roles[0] ?? "",
        comment,
        workflowDefinitionId: instance.workflowDefinitionId,
        fromState: instance.currentStateName,
        finalState: toState.name,
        transitionId,
        transitionName: transition.name,
        occurredAt: new Date().toISOString(),
      });
    }

    // Step 11: Cache the result for idempotent retries and release the lock
    if (idempotencyKey) {
      const idempotencyCache = CacheKeys.transitionIdempotency(tenantId, idempotencyKey);
      await this.redis.set(idempotencyCache, updated!, CacheTTL.IMMUTABLE);
      await this.redis.del(`${idempotencyCache}:lock`);
    }

    return updated!;
  }
}
