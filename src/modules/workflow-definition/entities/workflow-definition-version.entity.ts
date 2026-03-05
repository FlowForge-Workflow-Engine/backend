import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";

/**
 * Immutable snapshot of a workflow definition at publish time.
 *
 * Constraint 10: Running instances store `definitionVersion` and use the
 * snapshot for execution — live definition rows are never consulted at
 * runtime after publication.
 *
 * UNIQUE(workflowDefinitionId, versionNumber) enforced at DB + index level.
 */
@Entity("workflow_definition_versions")
@Index(["workflowDefinitionId", "versionNumber"], { unique: true })
export class WorkflowDefinitionVersion extends BaseEntity {
  /** Foreign key to workflow definition - links version to parent workflow */
  @Column({ type: "uuid", name: "workflow_definition_id" })
  workflowDefinitionId: string;

  /** Sequential version number - tracks workflow evolution chronologically */
  @Column({ type: "integer", name: "version_number" })
  versionNumber: number;

  /**
   * Full frozen snapshot: { name, states[], transitions[], rules[] } - immutable workflow definition
   * Used by WorkflowExecutionModule at transition time.
   */
  @Column({ type: "jsonb" })
  snapshot: Record<string, unknown>;

  /** Only one version per definition should have isActive = true at a time - controls which version is used */
  @Column({ type: "boolean", name: "is_active", default: false })
  isActive: boolean;

  /** UUID of user who published this version - tracks version ownership */
  @Column({ type: "uuid", name: "published_by" })
  publishedBy: string;

  /** Timestamp when version was published - tracks version release timeline */
  @Column({ type: "timestamptz", name: "published_at", nullable: true })
  publishedAt: Date | null;
}
