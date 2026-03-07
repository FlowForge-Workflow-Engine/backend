import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { generateUUID } from "@app/shared/utils/uuid.util";
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
    private readonly dataSource: DataSource,
    private readonly publisher: ExecutionPublisher,
    private readonly redis: RedisService
  ) {}

  async execute(command: CancelInstanceCommand): Promise<WorkflowInstance> {
    const { instanceId, actor } = command;
    const tenantId = actor.tenantId;

    // Step 1: Load and validate the workflow instance before cancellation
    const instance = await this.instanceRepo.findByIdAndTenant(instanceId, tenantId);
    if (!instance) throw new NotFoundException(AppErrors.WORKFLOW_INSTANCE_NOT_FOUND);
    if (instance.status !== WorkflowInstanceStatus.ACTIVE) {
      throw new UnprocessableEntityException(AppErrors.WORKFLOW_INSTANCE_NOT_ACTIVE);
    }

    const eventId = generateUUID();

    // Step 2: Cancel the instance atomically
    await this.dataSource.transaction(async (em) => {
      // Mark the instance as cancelled and close it with a completion timestamp.
      await em.query(
        `UPDATE workflow_instances
         SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [instanceId, tenantId]
      );
    });

    // Step 3: Publish a cancellation event for downstream consumers
    this.publisher.publishInstanceCancelled({
      eventId,
      tenantId,
      instanceId,
      performedByUserId: actor.sub,
      performedByEmail: actor.email,
      workflowDefinitionId: instance.workflowDefinitionId,
      cancelledByUserId: actor.sub,
      occurredAt: new Date().toISOString(),
    });

    // Step 4: Invalidate instance-related caches because status/details changed
    await Promise.allSettled([
      this.redis.del(CacheKeys.allowedTransitions(tenantId, instanceId)),
      this.redis.del(CacheKeys.instanceDetail(tenantId, instanceId)),
    ]);

    // Step 5: Reload and return the updated instance state
    const updated = await this.instanceRepo.findByIdAndTenant(instanceId, tenantId);
    return updated!;
  }
}
