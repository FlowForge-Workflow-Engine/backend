import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import {
  CustomRuleDefinition,
  CustomRuleStrategy,
  RuleFactNamespace,
  RuleType,
  WorkflowRuleDefinition,
} from "@app/shared/interfaces/contracts/rule-engine.contract";
import {
  WorkflowInstanceFormField,
  WorkflowInstanceFormSchema,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { WorkflowTransitionRepository } from "../repositories/workflow-transition.repository";
import { WorkflowStateRepository } from "../repositories/workflow-state.repository";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { TransitionRuleRepository } from "../repositories/transition-rule.repository";
import { InstanceFormSchemaRepository } from "../repositories/instance-form-schema.repository";
import { WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowTransition } from "../entities/workflow-transition.entity";
import { TransitionRule } from "../entities/transition-rule.entity";
import { CreateWorkflowTransitionDto } from "../dto/create-workflow-transition.dto";
import { CreateTransitionRuleDto } from "../dto/create-transition-rule.dto";
import { FindWorkflowTransitionDto } from "../dto/find-workflow-transition.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

/**
 * Service for managing workflow transitions and transition rules.
 * Transitions define allowed state changes within a workflow definition.
 * Only DRAFT definitions can be modified; published definitions are immutable.
 *
 * Responsibilities:
 * - Create, read, remove workflow transitions
 * - Add, manage transition rules (conditions for state transitions)
 * - Validate state references and definition status
 * - Invalidate caches on mutations
 */
@Injectable()
export class WorkflowTransitionService {
  private readonly logger = new Logger(WorkflowTransitionService.name);

  constructor(
    private readonly transitionRepository: WorkflowTransitionRepository,
    private readonly stateRepository: WorkflowStateRepository,
    private readonly definitionRepository: WorkflowDefinitionRepository,
    private readonly ruleRepository: TransitionRuleRepository,
    private readonly instanceFormSchemaRepository: InstanceFormSchemaRepository,
    private readonly redis: RedisService
  ) {}

  /**
   * Creates a new workflow transition within a definition.
   * Only DRAFT definitions can have transitions added.
   * Validates that both fromState and toState exist and belong to the definition.
   * Invalidates definition and transitions caches after creation.
   *
   * @param definitionId - The workflow definition ID
   * @param dto - Transition creation data (name, fromStateId, toStateId, allowedRoleIds, requiresComment)
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowTransition> - The created transition entity
   * @throws NotFoundException - If definition or states not found
   * @throws BadRequestException - If definition is not DRAFT
   */
  async create(
    definitionId: string,
    dto: CreateWorkflowTransitionDto,
    tenantId: string
  ): Promise<WorkflowTransition> {
    // Step 1: Load and validate the parent definition before adding transitions to it.
    const definition = await this.definitionRepository.findByIdAndTenant(definitionId, tenantId);

    if (!definition) throw new NotFoundException(AppErrors.WORKFLOW_DEFINITION_NOT_FOUND);
    if (definition.status !== WorkflowDefinitionStatus.DRAFT) {
      throw new BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_DRAFT);
    }

    // Step 2: Validate both state references exist for this tenant.
    const fromState = await this.stateRepository.findByIdAndTenant(dto.fromStateId, tenantId);
    if (!fromState) throw new NotFoundException(AppErrors.WORKFLOW_STATE_NOT_FOUND);

    const toState = await this.stateRepository.findByIdAndTenant(dto.toStateId, tenantId);
    if (!toState) throw new NotFoundException(AppErrors.WORKFLOW_STATE_NOT_FOUND);

    // Step 3: Create the transition entity with the configured role/comment constraints.
    const transition = this.transitionRepository.create({
      workflowDefinitionId: definitionId,
      tenantId,
      name: dto.name,
      fromStateId: dto.fromStateId,
      toStateId: dto.toStateId,
      allowedRoleIds: dto.allowedRoleIds ?? [],
      requiresComment: dto.requiresComment ?? false,
    });

    // Step 4: Persist the transition and invalidate read-model caches that include transition data.
    const saved = await this.transitionRepository.save(transition);
    await this.redis.del(
      CacheKeys.workflowDefinition(tenantId, definitionId),
      CacheKeys.workflowTransitions(tenantId, definitionId),
      CacheKeys.workflowDefinitionList(tenantId)
    );
    this.logger.log(`WorkflowTransition created: ${saved.id} [definition=${definitionId}]`);
    return saved;
  }

  /**
   * Retrieves paginated transitions for a workflow definition.
   *
   * @param dto - Pagination parameters
   * @param definitionId - The workflow definition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowTransition[]> - Paginated transitions for the definition
   */
  async findAll(
    dto: FindWorkflowTransitionDto,
    definitionId: string,
    tenantId: string
  ): Promise<WorkflowTransition[]> {
    const { page, limit } = dto;

    // Query transitions for the definition with repository-level pagination.
    return this.transitionRepository.findByDefinitionAndTenant(definitionId, tenantId, { page, limit });
  }

  /**
   * Retrieves a single workflow transition by ID.
   *
   * @param id - The workflow transition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowTransition> - The transition entity
   * @throws NotFoundException - If transition not found
   */
  async findById(id: string, tenantId: string): Promise<WorkflowTransition> {
    // Load the transition with tenant isolation and fail fast when absent.
    const transition = await this.transitionRepository.findByIdAndTenant(id, tenantId);

    if (!transition) throw new NotFoundException(AppErrors.WORKFLOW_TRANSITION_NOT_FOUND);

    return transition;
  }

  /**
   * Removes a workflow transition from a definition.
   * Cascades to remove all associated transition rules.
   * Invalidates definition and transitions caches.
   *
   * @param id - The workflow transition ID to remove
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<void>
   * @throws NotFoundException - If transition not found
   */
  async remove(id: string, tenantId: string): Promise<void> {
    // Step 1: Load the transition so we can resolve its parent definition for cache invalidation.
    const transition = await this.findById(id, tenantId);
    const definitionId = transition.workflowDefinitionId;

    // Step 2: Remove child rules first, then remove the transition record itself.
    await this.ruleRepository.removeByTransitionId(id, tenantId);

    await this.transitionRepository.remove(transition);

    // Step 3: Clear caches that expose definition and transition topology.
    await this.redis.del(
      CacheKeys.workflowDefinition(tenantId, definitionId),
      CacheKeys.workflowTransitions(tenantId, definitionId),
      CacheKeys.workflowDefinitionList(tenantId)
    );
  }

  /**
   * Adds a transition rule to a workflow transition.
   * Rules are evaluated in order (evaluationOrder) during workflow execution.
   * Invalidates transitions cache since rules are part of transition data.
   *
   * @param transitionId - The workflow transition ID
   * @param dto - Rule creation data (ruleName, ruleDefinition, evaluationOrder)
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<TransitionRule> - The created transition rule
   * @throws NotFoundException - If transition not found
   */
  async addRule(
    transitionId: string,
    dto: CreateTransitionRuleDto,
    tenantId: string
  ): Promise<TransitionRule> {
    // Step 1: Load the transition and parent definition to validate the mutation target.
    const transition = await this.findById(transitionId, tenantId);
    const definition = await this.definitionRepository.findByIdAndTenant(
      transition.workflowDefinitionId,
      tenantId
    );

    if (!definition) throw new NotFoundException(AppErrors.WORKFLOW_DEFINITION_NOT_FOUND);
    if (definition.status !== WorkflowDefinitionStatus.DRAFT) {
      throw new BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_DRAFT);
    }

    // Step 2: Ensure any payload fields referenced by the rule are described in schemaFields.
    // ensure fields in ruleDefnition are described in schemaFields
    this.validateSchemaFieldsForRule(dto);

    // Step 3: Create and persist the transition rule.
    const rule = this.ruleRepository.create({
      transitionId: transition.id,
      tenantId,
      ruleName: dto.ruleName,
      ruleDefinition: dto.ruleDefinition,
      evaluationOrder: dto.evaluationOrder ?? 0,
    });

    const saved = await this.ruleRepository.save(rule);

    // Step 4: Merge any supplied schema field definitions into the workflow instance form schema.
    if (dto.schemaFields?.length) {
      await this.upsertInstanceFormSchema(transition.workflowDefinitionId, tenantId, dto.schemaFields);
    }

    // Invalidate transition cache since rules are part of the transition data
    await this.redis.del(
      CacheKeys.workflowTransitions(tenantId, transition.workflowDefinitionId),
      CacheKeys.workflowInstanceFormSchema(tenantId, transition.workflowDefinitionId)
    );

    return saved;
  }

  /**
   * Retrieves all rules configured for a transition.
   *
   * @param transitionId - The workflow transition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<TransitionRule[]> - Ordered rules for the transition
   */
  async getAllRules(transitionId: string, tenantId: string) {
    // Validate transition existence before listing its rules.
    await this.findById(transitionId, tenantId);

    return this.ruleRepository.findByTransitionId(transitionId, tenantId);
  }

  /**
   * Removes a single rule from a workflow transition.
   * Only transitions belonging to draft workflow definitions may have rules deleted.
   * Invalidates transition-related caches after removal.
   *
   * @param transitionId - The workflow transition ID
   * @param ruleId - The transition rule ID to remove
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<void>
   * @throws NotFoundException - If transition, definition, or rule is not found
   * @throws BadRequestException - If the parent workflow definition is not in DRAFT status
   */
  async removeRule(transitionId: string, ruleId: string, tenantId: string): Promise<void> {
    // Step 1: Load the transition to resolve its parent workflow definition.
    const transition = await this.findById(transitionId, tenantId);
    const definition = await this.definitionRepository.findByIdAndTenant(
      transition.workflowDefinitionId,
      tenantId
    );

    if (!definition) throw new NotFoundException(AppErrors.WORKFLOW_DEFINITION_NOT_FOUND);
    if (definition.status !== WorkflowDefinitionStatus.DRAFT) {
      throw new BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_DRAFT);
    }

    // Step 2: Ensure the rule exists and belongs to the target transition.
    const rule = await this.ruleRepository.findByIdAndTenant(ruleId, tenantId);
    if (!rule || rule.transitionId !== transitionId) {
      throw new NotFoundException(AppErrors.TRANSITION_RULE_NOT_FOUND);
    }

    // Step 3: Remove the rule first so recomputation only sees still-active rules.
    await this.ruleRepository.remove(rule);
    // Rebuild the definition-level payload form schema to drop stale fields that were
    // introduced only by the deleted rule and are no longer referenced anywhere else.
    await this.recomputeInstanceFormSchema(transition.workflowDefinitionId, tenantId);
    // Clear both transition and form-schema caches so subsequent reads observe the deletion.
    await this.redis.del(
      CacheKeys.workflowTransitions(tenantId, transition.workflowDefinitionId),
      CacheKeys.workflowInstanceFormSchema(tenantId, transition.workflowDefinitionId)
    );
  }

  /**
   * Recomputes the persisted instance form schema from the payload keys still referenced
   * by the remaining transition rules within a workflow definition.
   *
   * This is especially important after rule deletion so stale payload fields do not remain
   * required for workflow instance creation when no surviving rule references them anymore.
   *
   * @param definitionId - The workflow definition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<void>
   */
  private async recomputeInstanceFormSchema(definitionId: string, tenantId: string): Promise<void> {
    // Rules are scoped to transitions, so gather all transitions under the definition first.
    const transitions = await this.transitionRepository.findByDefinitionAndTenant(definitionId, tenantId);
    const rulesByTransition = await Promise.all(
      transitions.map((transition) => this.ruleRepository.findByTransitionId(transition.id, tenantId))
    );
    const remainingRules = rulesByTransition.flat();

    const referencedPayloadKeys = new Set<string>();
    for (const remainingRule of remainingRules) {
      // Reuse the same payload-path extraction logic used during rule creation validation.
      for (const key of this.collectPayloadSchemaFieldKeys(remainingRule.ruleDefinition)) {
        referencedPayloadKeys.add(key);
      }
    }

    const existing = await this.instanceFormSchemaRepository.findByDefinitionAndTenant(
      definitionId,
      tenantId
    );
    if (!existing && referencedPayloadKeys.size === 0) return;

    const currentSchema = this.normalizeInstanceFormSchema(existing?.schema);
    // Preserve stored field metadata, but keep only keys that are still referenced by at least
    // one remaining rule somewhere in the workflow definition.
    const nextFields = currentSchema.fields.filter((field) => referencedPayloadKeys.has(field.key));
    const nextSchemaRecord: Record<string, unknown> = { fields: nextFields };
    const entity =
      existing ??
      this.instanceFormSchemaRepository.create({
        workflowDefinitionId: definitionId,
        tenantId,
        schema: nextSchemaRecord,
      });

    entity.schema = nextSchemaRecord;
    await this.instanceFormSchemaRepository.save(entity);
  }

  /**
   * Merges new schema fields into the persisted instance form schema for a definition.
   * Existing fields are preserved and overwritten only by matching keys.
   *
   * @param definitionId - The workflow definition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param schemaFields - Schema fields referenced by transition rules
   * @returns Promise<void>
   */
  private async upsertInstanceFormSchema(
    definitionId: string,
    tenantId: string,
    schemaFields: WorkflowInstanceFormField[]
  ): Promise<void> {
    // Load any existing schema so new rule fields can be merged without losing prior ones.
    const existing = await this.instanceFormSchemaRepository.findByDefinitionAndTenant(
      definitionId,
      tenantId
    );
    const currentSchema = this.normalizeInstanceFormSchema(existing?.schema);
    const mergedFields = new Map(currentSchema.fields.map((field) => [field.key, field]));

    // Upsert each field by key so duplicate references collapse into one canonical schema entry.
    for (const field of schemaFields) {
      mergedFields.set(field.key, {
        key: field.key,
        type: field.type,
        label: field.label,
        required: field.required,
      });
    }

    // Persist the merged schema back into the definition-scoped schema record.
    const nextFields = Array.from(mergedFields.values());
    const nextSchemaRecord: Record<string, unknown> = { fields: nextFields };
    const entity =
      existing ??
      this.instanceFormSchemaRepository.create({
        workflowDefinitionId: definitionId,
        tenantId,
        schema: nextSchemaRecord,
      });

    entity.schema = nextSchemaRecord;
    await this.instanceFormSchemaRepository.save(entity);
  }

  /**
   * Verifies that rule definitions referencing payload fields also provide matching schema metadata.
   *
   * @param dto - Transition rule creation payload
   * @returns void
   * @throws BadRequestException - If required schema fields are missing
   */
  private validateSchemaFieldsForRule(dto: CreateTransitionRuleDto): void {
    // Derive the payload field keys referenced anywhere inside the rule definition.
    const requiredSchemaFieldKeys = this.collectPayloadSchemaFieldKeys(dto.ruleDefinition);
    if (requiredSchemaFieldKeys.length === 0) return;

    /* Example rule definition:
      {
        "ruleName": "amount-must-exceed-1000",
        "ruleDefinition": {
          "all": [
            {
              "fact": "payload",
              "path": "$.amount",
              "operator": "greaterThan",
              "value": 1000
            }
          ],
          "type": "`custom` only when you define a custom rule, else leave it empty",
          "strategy": "The name of the custom rule strategy to use. Only required when type is `custom`, example `date-range-matches-days`"
        },
        "evaluationOrder": 0,
        "schemaFields": [
          {
            "key": "days",
            "type": "number",
            "label": "Number of Leave Days",
            "required": true
          }
        ]
      }
    */

    // Compare referenced keys against the schema fields supplied alongside the rule.
    const providedSchemaFieldKeys = new Set((dto.schemaFields ?? []).map((field) => field.key));
    const missingSchemaFields = requiredSchemaFieldKeys.filter((key) => !providedSchemaFieldKeys.has(key));

    if (missingSchemaFields.length > 0) {
      throw new BadRequestException({
        errorCode: AppErrors.TRANSITION_RULE_SCHEMA_FIELDS_MISSING,
        missingSchemaFields,
      });
    }
  }

  /**
   * Collects payload field keys referenced by a rule definition.
   * Supports both expression-based rules and custom strategy rules.
   *
   * @param ruleDefinition - Transition rule definition payload
   * @returns string[] - Referenced payload schema keys
   */
  private collectPayloadSchemaFieldKeys(ruleDefinition: Record<string, unknown>): string[] {
    const definition = ruleDefinition as WorkflowRuleDefinition;

    if (this.isCustomRuleDefinition(definition)) {
      return this.collectCustomRulePayloadSchemaFieldKeys(definition);
    }

    const schemaFieldKeys = new Set<string>();
    this.collectExpressionPayloadSchemaFieldKeys(ruleDefinition, schemaFieldKeys);
    return Array.from(schemaFieldKeys);
  }

  /**
   * Recursively walks a rule expression tree and extracts payload fact paths.
   *
   * Example definition:
   *  "ruleDefinition": {
   *    "all": [
   *      {
   *        "fact": "payload",
   *        "path": "$.amount",
   *        "operator": "greaterThan",
   *        "value": 1000
   *      }
   *    ],
   *  },
   *
   * @param node - Current expression node or array of nodes
   * @param schemaFieldKeys - Accumulator for discovered payload keys
   * @returns void
   */
  private collectExpressionPayloadSchemaFieldKeys(node: unknown, schemaFieldKeys: Set<string>): void {
    if (Array.isArray(node)) {
      for (const item of node) {
        this.collectExpressionPayloadSchemaFieldKeys(item, schemaFieldKeys);
      }
      return;
    }

    if (!node || typeof node !== "object") return;

    const candidate = node as Record<string, unknown>;
    if (candidate["fact"] === RuleFactNamespace.PAYLOAD) {
      // Normalize JSON-path-like references before storing them as schema keys.
      const key = this.normalizePayloadFieldKey(candidate["path"]);
      if (key) {
        schemaFieldKeys.add(key);
      }
    }

    this.collectExpressionPayloadSchemaFieldKeys(candidate["all"], schemaFieldKeys);
    this.collectExpressionPayloadSchemaFieldKeys(candidate["any"], schemaFieldKeys);
    this.collectExpressionPayloadSchemaFieldKeys(candidate["not"], schemaFieldKeys);
  }

  /**
   * Extracts payload field keys referenced by supported custom rule strategies.
   *
   * @param definition - Custom rule definition
   * @returns string[] - Referenced payload schema keys
   */
  private collectCustomRulePayloadSchemaFieldKeys(definition: CustomRuleDefinition): string[] {
    const params = definition.params ?? {};

    switch (definition.strategy) {
      case CustomRuleStrategy.DATE_RANGE_MATCHES_DAYS: {
        const keys = [
          this.normalizePayloadFieldKey(params["startDateField"]) ?? "startDate",
          this.normalizePayloadFieldKey(params["endDateField"]) ?? "endDate",
          this.normalizePayloadFieldKey(params["daysField"]) ?? "days",
        ];

        return Array.from(new Set(keys));
      }
      case CustomRuleStrategy.USER_HAS_ANY_ROLE:
        return [];
      default:
        return [];
    }
  }

  /**
   * Normalizes payload path syntax into a plain schema field key.
   *
   * @param path - Raw rule path expression
   * @returns string | null - Normalized field key or null when invalid
   */
  private normalizePayloadFieldKey(path: unknown): string | null {
    if (typeof path !== "string") return null;

    const trimmed = path.trim();
    if (!trimmed) return null;

    //  "path": "$.amount",
    const withoutRoot = trimmed.startsWith("$.")
      ? trimmed.slice(2)
      : trimmed.startsWith("$")
        ? trimmed.slice(1).replace(/^\./, "")
        : trimmed.replace(/^\./, "");

    return withoutRoot.trim() || null;
  }

  /**
   * Type guard for detecting custom rule definitions.
   *
   * @param definition - Candidate workflow rule definition
   * @returns boolean - True when the definition is a custom rule
   */
  private isCustomRuleDefinition(definition: WorkflowRuleDefinition): definition is CustomRuleDefinition {
    return definition["type"] === RuleType.CUSTOM && typeof definition["strategy"] === "string";
  }

  /**
   * Normalizes persisted schema JSON into a typed workflow instance form schema.
   *
   * @param schema - Raw schema record payload
   * @returns WorkflowInstanceFormSchema - Sanitized schema object
   */
  private normalizeInstanceFormSchema(
    schema: Record<string, unknown> | null | undefined
  ): WorkflowInstanceFormSchema {
    // Safely read the fields array because the stored payload is untyped JSON.
    const rawFields = Array.isArray((schema as { fields?: unknown } | null | undefined)?.fields)
      ? ((schema as { fields: unknown[] }).fields ?? [])
      : [];

    return {
      fields: rawFields
        .filter((field): field is WorkflowInstanceFormField => this.isWorkflowInstanceFormField(field))
        .map((field) => ({
          key: field.key,
          type: field.type,
          label: field.label,
          required: field.required,
        })),
    };
  }

  /**
   * Type guard for validating a schema field entry from persisted JSON.
   *
   * @param field - Unknown schema field candidate
   * @returns boolean - True when the value matches WorkflowInstanceFormField shape
   */
  private isWorkflowInstanceFormField(field: unknown): field is WorkflowInstanceFormField {
    if (!field || typeof field !== "object") return false;
    const candidate = field as Partial<WorkflowInstanceFormField>;

    return (
      typeof candidate.key === "string" &&
      typeof candidate.type === "string" &&
      typeof candidate.label === "string" &&
      typeof candidate.required === "boolean"
    );
  }
}
