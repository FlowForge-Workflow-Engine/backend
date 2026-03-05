import { Injectable, Logger } from "@nestjs/common";
import { generateUUID } from "@app/shared/utils/uuid.util";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { WorkflowStateRepository } from "../repositories/workflow-state.repository";
import { WorkflowTransitionRepository } from "../repositories/workflow-transition.repository";
import { TransitionRuleRepository } from "../repositories/transition-rule.repository";
import { WorkflowVersionRepository } from "../repositories/workflow-version.repository";
import { WorkflowDefinitionPublisher } from "../publishers/workflow-definition.publisher";
import { WorkflowDefinition, WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowDefinitionVersion } from "../entities/workflow-definition-version.entity";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

@Injectable()
export class WorkflowVersionService {
  private readonly logger = new Logger(WorkflowVersionService.name);

  constructor(
    private readonly definitionRepository: WorkflowDefinitionRepository,
    private readonly stateRepository: WorkflowStateRepository,
    private readonly transitionRepository: WorkflowTransitionRepository,
    private readonly ruleRepository: TransitionRuleRepository,
    private readonly versionRepository: WorkflowVersionRepository,
    private readonly publisher: WorkflowDefinitionPublisher,
    private readonly redis: RedisService
  ) {}

  /**
   * Publish logic (Constraint 10):
   * 1. Load all states + transitions + rules for this definition
   * 2. Serialize to snapshot JSONB
   * 3. Create WorkflowDefinitionVersion record with snapshot + version number
   * 4. Set is_active = true on new version, is_active = false on all previous
   * 5. Update workflow_definitions.current_version and status = 'published'
   * 6. Publish WORKFLOW_DEFINITION_PUBLISHED event
   */
  async publish(definition: WorkflowDefinition, publishedBy: string): Promise<WorkflowDefinitionVersion> {
    const tenantId = definition.tenantId;
    const states = await this.stateRepository.findByDefinitionAndTenant(definition.id, tenantId);
    const transitions = await this.transitionRepository.findByDefinitionAndTenant(definition.id, tenantId);

    const transitionsWithRules = await Promise.all(
      transitions.map(async (t) => {
        const rules = await this.ruleRepository.findByTransitionId(t.id, tenantId);
        return { ...t, rules };
      })
    );

    const snapshot: Record<string, unknown> = {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      states: states.map((s) => ({
        id: s.id,
        name: s.name,
        isInitial: s.isInitial,
        isTerminal: s.isTerminal,
        metadata: s.metadata,
      })),
      transitions: transitionsWithRules.map((t) => ({
        id: t.id,
        name: t.name,
        fromStateId: t.fromStateId,
        toStateId: t.toStateId,
        allowedRoleIds: t.allowedRoleIds,
        requiresComment: t.requiresComment,
        rules: t.rules.map((r) => ({
          id: r.id,
          ruleName: r.ruleName,
          ruleDefinition: r.ruleDefinition,
          evaluationOrder: r.evaluationOrder,
        })),
      })),
    };

    const nextVersion = definition.currentVersion;

    // Deactivate all previous versions
    await this.versionRepository.deactivateAll(definition.id, tenantId);

    const version = this.versionRepository.create({
      workflowDefinitionId: definition.id,
      tenantId,
      versionNumber: nextVersion,
      snapshot,
      isActive: true,
      publishedBy,
      publishedAt: new Date(),
    });
    const saved = await this.versionRepository.save(version);

    // Update definition status and bump current_version for next publish
    definition.status = WorkflowDefinitionStatus.PUBLISHED;
    definition.currentVersion = nextVersion + 1;
    await this.definitionRepository.save(definition);

    // Invalidate mutable caches — snapshot is NOT deleted (immutable once created)
    await Promise.allSettled([
      this.redis.del(CacheKeys.workflowDefinition(tenantId, definition.id)),
      this.redis.del(CacheKeys.workflowDefinitionList(tenantId)),
      this.redis.del(CacheKeys.workflowStates(tenantId, definition.id)),
      this.redis.del(CacheKeys.workflowTransitions(tenantId, definition.id)),
    ]);

    this.publisher.publishWorkflowDefinitionPublished({
      eventId: generateUUID(),
      tenantId,
      definitionId: definition.id,
      versionNumber: nextVersion,
      publishedByUserId: publishedBy,
      occurredAt: new Date().toISOString(),
    });

    this.logger.log(`Published workflow definition ${definition.id} v${nextVersion}`);
    return saved;
  }
}
