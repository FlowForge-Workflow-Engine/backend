import { Injectable } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { WorkflowInstance } from "../entities/workflow-instance.entity";
import { CreateInstanceCommand } from "../commands/create-instance.command";
import { ExecuteTransitionCommand } from "../commands/execute-transition.command";
import { CancelInstanceCommand } from "../commands/cancel-instance.command";
import { GetInstanceDetailQuery, GetInstanceDetailResult } from "../queries/get-instance-detail.query";
import { GetInstanceListQuery, GetInstanceListResult } from "../queries/get-instance-list.query";
import {
  GetAllowedTransitionsQuery,
  GetAllowedTransitionsResult,
} from "../queries/get-allowed-transitions.query";
import { FindWorkflowInstanceDto } from "../dto/find-workflow-instance.dto";

/**
 * Thin facade service for workflow execution operations.
 * Dispatches all operations to CommandBus (for mutations) and QueryBus (for reads).
 * Implements CQRS pattern to separate command and query responsibilities.
 *
 * Controllers interact only with this service; they never import handlers directly.
 * This provides a clean API boundary and allows handlers to be swapped without affecting controllers.
 *
 * Responsibilities:
 * - Create workflow instances from published definitions
 * - Execute state transitions with rule evaluation
 * - Cancel running instances
 * - Query instance details and lists
 * - Determine allowed transitions based on user roles and rules
 */
@Injectable()
export class WorkflowExecutionService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  /**
   * Creates a new workflow instance from a published definition.
   * Initializes the instance in the initial state with provided payload.
   * Publishes WORKFLOW_INSTANCE_CREATED domain event.
   *
   * @param workflowDefinitionId - The published workflow definition ID
   * @param payload - Initial instance data (arbitrary JSON object)
   * @param actor - The user creating the instance (id, email, roles, tenantId)
   * @returns Promise<WorkflowInstance> - The created workflow instance
   * @throws NotFoundException - If definition not found or not published
   * @throws BadRequestException - If definition is deprecated
   */
  createInstance(
    workflowDefinitionId: string,
    payload: Record<string, unknown>,
    actor: IJwtPayload
  ): Promise<WorkflowInstance> {
    return this.commandBus.execute(new CreateInstanceCommand(workflowDefinitionId, payload, actor));
  }

  /**
   * Executes a state transition on a workflow instance.
   * Evaluates transition rules, checks user permissions, and updates instance state.
   * Supports optimistic locking via expectedVersion to prevent concurrent modifications.
   * Supports idempotency via idempotencyKey for safe retries.
   * Publishes WORKFLOW_INSTANCE_TRANSITIONED domain event.
   *
   * @param instanceId - The workflow instance ID
   * @param transitionId - The transition to execute
   * @param expectedVersion - Expected current version (for optimistic locking)
   * @param comment - Optional comment explaining the transition
   * @param actor - The user executing the transition (id, email, roles, tenantId)
   * @param idempotencyKey - Optional key for idempotent retries
   * @returns Promise<WorkflowInstance> - The updated workflow instance
   * @throws NotFoundException - If instance or transition not found
   * @throws BadRequestException - If transition not allowed or rules fail
   * @throws ConflictException - If version mismatch (optimistic lock failure)
   */
  executeTransition(
    instanceId: string,
    transitionId: string,
    expectedVersion: number,
    comment: string | undefined,
    actor: IJwtPayload,
    idempotencyKey?: string
  ): Promise<WorkflowInstance> {
    return this.commandBus.execute(
      new ExecuteTransitionCommand(instanceId, transitionId, expectedVersion, comment, actor, idempotencyKey)
    );
  }

  /**
   * Cancels a running workflow instance.
   * Marks instance as CANCELLED and prevents further transitions.
   * Publishes WORKFLOW_INSTANCE_CANCELLED domain event.
   *
   * @param instanceId - The workflow instance ID to cancel
   * @param actor - The user cancelling the instance (id, email, roles, tenantId)
   * @returns Promise<WorkflowInstance> - The cancelled workflow instance
   * @throws NotFoundException - If instance not found
   * @throws BadRequestException - If instance is already in terminal state
   */
  cancelInstance(instanceId: string, actor: IJwtPayload): Promise<WorkflowInstance> {
    return this.commandBus.execute(new CancelInstanceCommand(instanceId, actor));
  }

  /**
   * Retrieves detailed information about a workflow instance.
   * Includes current state, payload, history, and metadata.
   *
   * @param instanceId - The workflow instance ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<GetInstanceDetailResult> - Instance detail with full history
   * @throws NotFoundException - If instance not found
   */
  getInstanceDetail(instanceId: string, tenantId: string): Promise<GetInstanceDetailResult> {
    return this.queryBus.execute(new GetInstanceDetailQuery(instanceId, tenantId));
  }

  /**
   * Retrieves a paginated list of workflow instances for a tenant.
   * Supports filtering by status and workflow definition.
   *
   * @param dto - Pagination and filter parameters
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<GetInstanceListResult> - Paginated list of instances with total count
   */
  getInstanceList(dto: FindWorkflowInstanceDto, tenantId: string): Promise<GetInstanceListResult> {
    const { page, limit, status, workflowDefinitionId } = dto;

    return this.queryBus.execute(
      new GetInstanceListQuery(tenantId, page, limit, status, workflowDefinitionId)
    );
  }

  /**
   * Determines which transitions are allowed for a user on a workflow instance.
   * Evaluates transition rules and checks user role permissions.
   * Used by UI to show available actions to the user.
   *
   * @param instanceId - The workflow instance ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param userRoles - Array of role IDs the user has
   * @returns Promise<GetAllowedTransitionsResult> - Array of allowed transitions with metadata
   * @throws NotFoundException - If instance not found
   */
  getAllowedTransitions(
    instanceId: string,
    tenantId: string,
    userRoles: string[]
  ): Promise<GetAllowedTransitionsResult> {
    return this.queryBus.execute(new GetAllowedTransitionsQuery(instanceId, tenantId, userRoles));
  }
}
