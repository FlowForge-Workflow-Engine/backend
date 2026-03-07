import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { generateUUID } from "@app/shared/utils/uuid.util";
import {
  IWorkflowQueryContract,
  WorkflowInstanceFormField,
  WORKFLOW_QUERY_CONTRACT,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { ExecutionPublisher } from "../publishers/execution.publisher";
import { CreateInstanceCommand } from "../commands/create-instance.command";
import { WorkflowInstance } from "../entities/workflow-instance.entity";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

@CommandHandler(CreateInstanceCommand)
export class CreateInstanceHandler implements ICommandHandler<CreateInstanceCommand> {
  constructor(
    private readonly instanceRepo: WorkflowInstanceRepository,
    @Inject(WORKFLOW_QUERY_CONTRACT)
    private readonly workflowQuery: IWorkflowQueryContract,
    private readonly publisher: ExecutionPublisher
  ) {}

  async execute(command: CreateInstanceCommand): Promise<WorkflowInstance> {
    const { workflowDefinitionId, payload, actor } = command;
    const tenantId = actor.tenantId;

    // Step 1: Validate workflow definition exists and is published
    const definition = await this.workflowQuery.findDefinitionById(workflowDefinitionId, tenantId);
    if (!definition) throw new NotFoundException(AppErrors.WORKFLOW_DEFINITION_NOT_FOUND);
    if (definition.status !== "published") {
      throw new UnprocessableEntityException(AppErrors.WORKFLOW_DEFINITION_NOT_PUBLISHED);
    }

    // Validate the incoming payload against the configured instance form schema.
    const formSchema = await this.workflowQuery.getInstanceFormSchema(workflowDefinitionId, tenantId);
    const missingFields = this.findMissingRequiredFields(payload, formSchema.fields);

    // Return the specific required fields that are absent so the client can correct the payload.
    if (missingFields.length > 0) {
      throw new UnprocessableEntityException({
        errorCode: AppErrors.WORKFLOW_INSTANCE_REQUIRED_FIELDS_MISSING,
        missingFields,
      });
    }

    // Step 2: Load immutable version snapshot (states, transitions, rules)
    const snapshot = await this.workflowQuery.getVersionSnapshot(
      workflowDefinitionId,
      definition.currentVersion - 1, // currentVersion was bumped after publish
      tenantId
    );
    if (!snapshot) throw new NotFoundException(AppErrors.DEFINITION_VERSION_NOT_FOUND);

    // Step 3: Extract states from snapshot and locate the initial state
    const states = (snapshot["states"] as any[]) ?? [];
    const initialState = states.find((s) => s.isInitial === true);
    if (!initialState) {
      throw new UnprocessableEntityException(AppErrors.WORKFLOW_INITIAL_STATE_REQUIRED);
    }

    // Step 4: Create the workflow instance entity using the initial state and payload
    const instance = this.instanceRepo.create({
      tenantId,
      workflowDefinitionId,
      definitionVersion: definition.currentVersion - 1,
      currentStateId: initialState.id,
      currentStateName: initialState.name,
      payload,
      status: WorkflowInstanceStatus.ACTIVE,
      version: 1,
      createdBy: actor.sub,
    });

    // Step 5: Persist the new instance in the database
    const saved = await this.instanceRepo.save(instance);

    // Step 6: Publish a creation event so downstream consumers can audit/react
    this.publisher.publishInstanceCreated({
      eventId: generateUUID(),
      tenantId,
      instanceId: saved.id,
      performedByUserId: actor.sub,
      performedByEmail: actor.email,
      workflowDefinitionId,
      initialState: initialState.name,
      createdByUserId: actor.sub,
      occurredAt: new Date().toISOString(),
    });

    return saved;
  }

  /**
   * Collects required schema fields that are missing from the submitted payload.
   *
   * @param payload - Incoming workflow instance payload
   * @param fields - Instance form schema fields to validate against
   * @returns string[] - Missing required field keys
   */
  private findMissingRequiredFields(
    payload: Record<string, unknown>,
    fields: readonly WorkflowInstanceFormField[]
  ): string[] {
    // console.log("fields", fields);
    // console.log("payload", payload);
    return fields
      .filter((field) => field.required)
      .map((field) => field.key)
      .filter((key) => this.isMissingPayloadValue(payload, key));
  }

  /**
   * Determines whether a payload value should be treated as missing.
   * Empty strings are considered missing in addition to null/undefined.
   *
   * @param payload - Incoming workflow instance payload
   * @param key - Dot-notated field key to inspect
   * @returns boolean - True when the payload does not contain a usable value
   */
  private isMissingPayloadValue(payload: Record<string, unknown>, key: string): boolean {
    const value = this.readPayloadValue(payload, key);
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim().length === 0;

    return false;
  }

  /**
   * Reads a nested value from the payload using a normalized dot-notated path.
   * Supports keys written as `field`, `.field`, `$field`, or `$.field`.
   *
   * @param payload - Incoming workflow instance payload
   * @param key - Raw schema field key/path
   * @returns unknown - Resolved payload value or undefined when path is absent
   */
  private readPayloadValue(payload: Record<string, unknown>, key: string): unknown {
    // Normalize schema paths into a plain dot-notated lookup key.
    const normalizedKey = key.trim().replace(/^\$\./, "").replace(/^\$/, "").replace(/^\./, "");
    if (!normalizedKey) {
      return payload;
    }

    // Walk the object path segment-by-segment until the target value is found.
    return normalizedKey.split(".").reduce<unknown>((current, segment) => {
      if (!current || typeof current !== "object") {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, payload);
  }
}
