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
import { generateUUID } from "@app/shared/utils/uuid.util";
import {
  IWorkflowQueryContract,
  WORKFLOW_QUERY_CONTRACT,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { RuleEngineService } from "../../rule-engine/services/rule-engine.service";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { WorkflowInstance, WorkflowInstanceStatus } from "../entities/workflow-instance.entity";
import { ExecutionPublisher } from "../publishers/execution.publisher";
import { ExecuteTransitionCommand } from "../commands/execute-transition.command";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";

@CommandHandler(ExecuteTransitionCommand)
export class ExecuteTransitionHandler implements ICommandHandler<ExecuteTransitionCommand> {
  private readonly logger = new Logger(ExecuteTransitionHandler.name);

  constructor(
    private readonly instanceRepo: WorkflowInstanceRepository,
    @Inject(WORKFLOW_QUERY_CONTRACT)
    private readonly workflowQuery: IWorkflowQueryContract,
    private readonly ruleEngine: RuleEngineService,
    private readonly dataSource: DataSource,
    private readonly publisher: ExecutionPublisher,
    private readonly redis: RedisService
  ) {}

  async execute(command: ExecuteTransitionCommand): Promise<WorkflowInstance> {
    const { instanceId, transitionId, expectedVersion, comment, actor, idempotencyKey } = command;
    const tenantId = actor.tenantId;

    // ─── Idempotency check ────────────────────────────────────────────────────
    if (idempotencyKey) {
      const idempotencyCache = CacheKeys.transitionIdempotency(tenantId, idempotencyKey);
      const existing = await this.redis.get<WorkflowInstance>(idempotencyCache);
      if (existing) return existing;

      const lockKey = `${idempotencyCache}:lock`;
      const claimed = await this.redis.setNX(lockKey, actor.sub, 30);
      if (!claimed) throw new ConflictException("DUPLICATE_REQUEST_IN_FLIGHT");
    }

    // 1. Load instance
    const instance = await this.instanceRepo.findByIdAndTenant(instanceId, tenantId);
    if (!instance) throw new NotFoundException(AppErrors.WORKFLOW_INSTANCE_NOT_FOUND);
    if (instance.status !== WorkflowInstanceStatus.ACTIVE) {
      throw new UnprocessableEntityException(AppErrors.WORKFLOW_INSTANCE_NOT_ACTIVE);
    }

    // 2. Load snapshot
    const snapshot = await this.workflowQuery.getVersionSnapshot(
      instance.workflowDefinitionId,
      instance.definitionVersion,
      tenantId
    );
    if (!snapshot) throw new NotFoundException(AppErrors.DEFINITION_VERSION_NOT_FOUND);

    const transitions = (snapshot["transitions"] as any[]) ?? [];
    const states = (snapshot["states"] as any[]) ?? [];

    // 3. Find the transition in snapshot
    const transition = transitions.find(
      (t) => t.id === transitionId && t.fromStateId === instance.currentStateId
    );
    if (!transition) throw new NotFoundException(AppErrors.TRANSITION_NOT_ALLOWED);

    // 4. Role check (allowedRoleIds stores role names in snapshot)
    const hasRole = actor.roles.some((r) => transition.allowedRoleIds.includes(r));
    if (!hasRole) throw new ForbiddenException(AppErrors.TRANSITION_ROLE_FORBIDDEN);

    // 5. Comment check
    if (transition.requiresComment && !comment?.trim()) {
      throw new UnprocessableEntityException(AppErrors.COMMENT_REQUIRED);
    }

    // 6. Evaluate rules
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

    // 7. Find toState
    const toState = states.find((s) => s.id === transition.toStateId);
    if (!toState) throw new NotFoundException(AppErrors.WORKFLOW_STATE_NOT_FOUND);

    const isTerminal: boolean = toState.isTerminal === true;
    const newStatus = isTerminal ? WorkflowInstanceStatus.COMPLETED : WorkflowInstanceStatus.ACTIVE;
    const eventId = generateUUID();

    // 8. ATOMIC TRANSACTION: optimistic-lock UPDATE + audit INSERT
    await this.dataSource.transaction(async (em) => {
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
          expectedVersion,
          tenantId,
        ]
      );

      if (result[1] === 0) {
        throw new ConflictException(AppErrors.TRANSITION_CONFLICT);
      }

      await em.query(
        `INSERT INTO audit_logs
           (id, tenant_id, instance_id, actor_id, actor_email, actor_role,
            action_type, transition_id, transition_name, from_state, to_state,
            comment, event_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'transition_executed',$7,$8,$9,$10,$11,$12,NOW())`,
        [
          generateUUID(),
          tenantId,
          instanceId,
          actor.sub,
          actor.email,
          actor.roles[0] ?? "",
          transitionId,
          transition.name,
          instance.currentStateName,
          toState.name,
          comment ?? null,
          eventId,
        ]
      );
    });

    // Invalidate instance-specific caches after successful transition
    await Promise.allSettled([
      this.redis.del(CacheKeys.allowedTransitions(tenantId, instanceId)),
      this.redis.del(CacheKeys.instanceDetail(tenantId, instanceId)),
    ]);

    // Refresh and publish
    const updated = await this.instanceRepo.findByIdAndTenant(instanceId, tenantId);

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

    if (isTerminal) {
      this.publisher.publishInstanceCompleted({
        eventId: generateUUID(),
        tenantId,
        instanceId,
        workflowDefinitionId: instance.workflowDefinitionId,
        finalState: toState.name,
        occurredAt: new Date().toISOString(),
      });
    }

    // Store idempotency result so retries return the same response
    if (idempotencyKey) {
      const idempotencyCache = CacheKeys.transitionIdempotency(tenantId, idempotencyKey);
      await this.redis.set(idempotencyCache, updated!, CacheTTL.IMMUTABLE);
      await this.redis.del(`${idempotencyCache}:lock`);
    }

    return updated!;
  }
}
