import { Injectable } from "@nestjs/common";
import {
  IWorkflowQueryContract,
  WorkflowDefinitionSummary,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { WorkflowVersionRepository } from "../repositories/workflow-version.repository";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";

/**
 * Read-only facade implementing IWorkflowQueryContract.
 * Exported via WORKFLOW_QUERY_CONTRACT Symbol token — the only cross-module
 * access point for this module's data.
 *
 * Provides efficient access to workflow definitions and version snapshots
 * using cache-aside pattern with appropriate TTLs.
 * Snapshots are immutable once published and cached indefinitely.
 */
@Injectable()
export class WorkflowQueryService implements IWorkflowQueryContract {
  constructor(
    private readonly definitionRepository: WorkflowDefinitionRepository,
    private readonly versionRepository: WorkflowVersionRepository,
    private readonly redis: RedisService
  ) {}

  /**
   * Retrieves a workflow definition summary by ID using cache-aside pattern.
   * Returns only essential definition data (id, name, currentVersion, status).
   * Caches result with LONG TTL for performance.
   *
   * @param definitionId - The workflow definition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowDefinitionSummary | null> - Definition summary or null if not found
   */
  async findDefinitionById(
    definitionId: string,
    tenantId: string
  ): Promise<WorkflowDefinitionSummary | null> {
    const key = CacheKeys.workflowDefinition(tenantId, definitionId);
    const cached = await this.redis.get<WorkflowDefinitionSummary>(key);
    if (cached) return cached;

    const definition = await this.definitionRepository.findByIdAndTenant(definitionId, tenantId);
    if (!definition) return null;

    const summary: WorkflowDefinitionSummary = {
      id: definition.id,
      name: definition.name,
      currentVersion: definition.currentVersion,
      status: definition.status,
    };
    await this.redis.set(key, summary, CacheTTL.LONG);
    return summary;
  }

  /**
   * Retrieves an immutable version snapshot containing states, transitions, and rules.
   * Snapshots are created at publish time and never change.
   * Cached with IMMUTABLE TTL since content never changes.
   * Used by WorkflowExecutionModule to execute workflow instances.
   *
   * @param definitionId - The workflow definition ID
   * @param version - The specific version number to retrieve
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<Record<string, unknown> | null> - Version snapshot or null if not found
   */
  async getVersionSnapshot(
    definitionId: string,
    version: number,
    tenantId: string
  ): Promise<Record<string, unknown> | null> {
    // Snapshots are immutable once published — cache with IMMUTABLE TTL
    const key = CacheKeys.workflowVersionSnapshot(tenantId, definitionId, version);
    const cached = await this.redis.get<Record<string, unknown>>(key);
    if (cached) return cached;

    const versionRecord = await this.versionRepository.findByDefinitionAndVersion(
      definitionId,
      version,
      tenantId
    );

    if (!versionRecord?.snapshot) return null;
    await this.redis.set(key, versionRecord.snapshot, CacheTTL.IMMUTABLE);
    return versionRecord.snapshot;
  }
}
