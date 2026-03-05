import { ApiProperty } from "@nestjs/swagger";
import { AuditActionType } from "../../entities/audit-log.entity";

/**
 * Audit Log Response DTO
 * Mirrors the AuditLog entity (append-only, no updatedAt).
 */
export class AuditLogResponseDto {
  @ApiProperty({ description: "Audit log unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ description: "Workflow instance ID this log belongs to", format: "uuid" })
  instanceId: string;

  @ApiProperty({ description: "ID of the actor who performed the action", format: "uuid" })
  actorId: string;

  @ApiProperty({ example: "john@example.com", description: "Snapshot of actor email at time of action" })
  actorEmail: string;

  @ApiProperty({ example: "admin", description: "Snapshot of actor role at time of action" })
  actorRole: string;

  @ApiProperty({
    enum: AuditActionType,
    example: AuditActionType.TRANSITION_EXECUTED,
    description: "Type of audit action",
  })
  actionType: AuditActionType;

  @ApiProperty({
    description: "ID of transition executed (null for non-transition events)",
    format: "uuid",
    nullable: true,
  })
  transitionId: string | null;

  @ApiProperty({ example: "Approve", description: "Snapshot of transition name", nullable: true })
  transitionName: string | null;

  @ApiProperty({
    example: "pending",
    description: "State before the action (null for instance_created)",
    nullable: true,
  })
  fromState: string | null;

  @ApiProperty({ example: "approved", description: "State after the action" })
  toState: string;

  @ApiProperty({
    example: "Approved as per manager review",
    description: "Optional user comment",
    nullable: true,
  })
  comment: string | null;

  @ApiProperty({ example: "192.168.1.1", description: "IP address of the actor", nullable: true })
  ipAddress: string | null;

  @ApiProperty({ example: "Mozilla/5.0 ...", description: "User agent of the actor", nullable: true })
  userAgent: string | null;

  @ApiProperty({ description: "Idempotency NATS event UUID", format: "uuid" })
  eventId: string;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Audit log creation timestamp (immutable)" })
  createdAt: Date;
}

/**
 * Audit Log List Response DTO
 * Used for GET /audit-logs endpoint
 */
export class AuditLogListResponseDto extends AuditLogResponseDto {}

/**
 * Audit Log Detail Response DTO
 * Used for GET /audit-logs/:id endpoint
 */
export class AuditLogDetailResponseDto extends AuditLogResponseDto {}
