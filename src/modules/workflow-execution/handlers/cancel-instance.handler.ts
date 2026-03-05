import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { generateUUID } from "@app/shared/utils/uuid.util";
import {
  IWorkflowQueryContract,
  WORKFLOW_QUERY_CONTRACT,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { WorkflowInstance } from "../entities/workflow-instance.entity";
import { ExecutionPublisher } from "../publishers/execution.publisher";
import { CancelInstanceCommand } from "../commands/cancel-instance.command";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

@CommandHandler(CancelInstanceCommand)
export class CancelInstanceHandler implements ICommandHandler<CancelInstanceCommand> {
  constructor(
    private readonly instanceRepo: WorkflowInstanceRepository,
    @Inject(WORKFLOW_QUERY_CONTRACT)
    private readonly workflowQuery: IWorkflowQueryContract,
    private readonly dataSource: DataSource,
    private readonly publisher: ExecutionPublisher,
    private readonly redis: RedisService
  ) {}

  async execute(command: CancelInstanceCommand): Promise<WorkflowInstance> {
    const { instanceId, actor } = command;
    const tenantId = actor.tenantId;

    const instance = await this.instanceRepo.findByIdAndTenant(instanceId, tenantId);
    if (!instance) throw new NotFoundException(AppErrors.WORKFLOW_INSTANCE_NOT_FOUND);
    if (instance.status !== WorkflowInstanceStatus.ACTIVE) {
      throw new UnprocessableEntityException(AppErrors.WORKFLOW_INSTANCE_NOT_ACTIVE);
    }

    const eventId = generateUUID();

    await this.dataSource.transaction(async (em) => {
      await em.query(
        `UPDATE workflow_instances
         SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [instanceId, tenantId]
      );

      await em.query(
        `INSERT INTO audit_logs
           (id, tenant_id, instance_id, actor_id, actor_email, actor_role,
            action_type, transition_id, transition_name, from_state, to_state,
            comment, event_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'instance_cancelled',NULL,NULL,$7,'cancelled',NULL,$8,NOW())`,
        [
          generateUUID(),
          tenantId,
          instanceId,
          actor.sub,
          actor.email,
          actor.roles[0] ?? "",
          instance.currentStateName,
          eventId,
        ]
      );
    });

    this.publisher.publishInstanceCancelled({
      eventId,
      tenantId,
      instanceId,
      workflowDefinitionId: instance.workflowDefinitionId,
      cancelledByUserId: actor.sub,
      occurredAt: new Date().toISOString(),
    });

    // Invalidate instance-specific cache entries after successful cancellation
    await Promise.allSettled([
      this.redis.del(CacheKeys.allowedTransitions(tenantId, instanceId)),
      this.redis.del(CacheKeys.instanceDetail(tenantId, instanceId)),
    ]);

    const updated = await this.instanceRepo.findByIdAndTenant(instanceId, tenantId);
    return updated!;
  }
}
