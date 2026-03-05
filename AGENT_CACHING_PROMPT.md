# 🗄️ Roo Code Agent Prompt — Caching Strategy Implementation

## Context & Continuity

This prompt is a **direct continuation** of `AGENT_PROMPT.md`. All architectural constraints, module boundaries, folder structures, and naming conventions defined in that prompt are still fully in force. Do not re-architect anything. This prompt exclusively covers **Redis caching implementation** — what to cache, where, how, and how to invalidate it.

The Redis client is already wired in `src/infra/redis.config.ts` and `docker-compose.yml`. What is missing is the **cache logic inside the modules**.

---

## Agent Role Reminder

You are the same senior architect from the previous prompt. You are now implementing the caching layer. You write zero placeholder code. Every cache key, TTL, and invalidation hook is deliberate and justified. You never cache data that would cause a security boundary violation (never cache across tenant boundaries).

---

## Redis Setup Assumptions (Already Done — Do Not Recreate)

- Redis is available via `REDIS_URL` env var
- `ioredis` is the Redis client (not `redis` npm package)
- A `RedisModule` or `RedisService` exists in `src/infra/redis.config.ts`
- All modules can inject `RedisService` without needing to import a Redis module explicitly

If `RedisService` does not yet exist as an injectable, create it at:

```
src/infra/redis.service.ts
```

with the following interface:

```typescript
class RedisService {
  async get<T>(key: string): Promise<T | null>;
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  async del(key: string): Promise<void>;
  async delByPattern(pattern: string): Promise<void>; // uses SCAN + DEL, never KEYS in production
  async exists(key: string): Promise<boolean>;
  async incr(key: string): Promise<number>;
  async expire(key: string, ttlSeconds: number): Promise<void>;
  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean>; // SET if Not eXists
}
```

Serialization: always `JSON.stringify` on write, `JSON.parse` on read. Wrap in try/catch — a Redis failure must **never crash the application**. Always fall through to the database on a cache miss or Redis error (cache-aside pattern).

---

## Golden Rules for This Codebase

Before implementing any cache, these rules are absolute:

| Rule                                      | Detail                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Never cache across tenants**            | Every cache key MUST include `tenantId`. A cache hit for tenant A must never be returnable to tenant B                               |
| **Cache-aside only**                      | Application reads cache first → on miss, reads DB → writes to cache. Never write-through, never write-behind                         |
| **Graceful degradation**                  | If Redis is down, the app continues working using the DB. Log the Redis error but do not throw it to the caller                      |
| **Invalidate on mutation**                | Every write operation that modifies cacheable data must invalidate the relevant cache key(s) immediately after the DB write succeeds |
| **TTL is a safety net, not the strategy** | Don't rely on TTL expiry for correctness. Always do explicit invalidation on writes. TTL is only a fallback for missed invalidations |
| **No KEYS command in production**         | Use `SCAN` for pattern-based deletions. `KEYS` is O(N) and blocks Redis                                                              |
| **Idempotency keys use `setNX`**          | Use Redis `SET NX EX` (set if not exists with expiry) for idempotency — not regular `set`                                            |

---

## Cache Key Naming Convention

All cache keys follow this structure:

```
<module>:<entity>:<identifier>:<tenantId>
```

Examples:

```
wf-def:definition:a1b2c3d4:tenant-uuid          ← workflow definition by ID
wf-def:definition-list:tenant-uuid              ← paginated list for a tenant
auth:user:user-uuid:tenant-uuid                 ← user summary
auth:user-roles:user-uuid:tenant-uuid           ← user's roles array
tenant:settings:tenant-uuid                     ← tenant settings
tenant:feature-flags:tenant-uuid                ← all feature flags for a tenant
wf-exec:allowed-transitions:instance-uuid:tenant-uuid  ← computed allowed transitions
rate-limit:api:<userId>:<endpoint-hash>         ← rate limiter counter
idempotency:transition:<idempotencyKey>:tenant-uuid    ← transition idempotency
```

Define all key-building functions in a single file:

```
src/infra/cache-keys.ts
```

```typescript
// src/infra/cache-keys.ts

export const CacheKeys = {
  // Auth module
  userSummary: (userId: string, tenantId: string) => `auth:user:${userId}:${tenantId}`,
  userRoles: (userId: string, tenantId: string) => `auth:user-roles:${userId}:${tenantId}`,
  usersByTenant: (tenantId: string) => `auth:user-list:${tenantId}`,

  // Tenant module
  tenantSettings: (tenantId: string) => `tenant:settings:${tenantId}`,
  tenantFeatureFlags: (tenantId: string) => `tenant:feature-flags:${tenantId}`,
  tenantById: (tenantId: string) => `tenant:by-id:${tenantId}`,

  // Workflow Definition module
  workflowDefinition: (definitionId: string, tenantId: string) =>
    `wf-def:definition:${definitionId}:${tenantId}`,
  workflowDefinitionList: (tenantId: string) => `wf-def:definition-list:${tenantId}`,
  workflowVersionSnapshot: (definitionId: string, version: number, tenantId: string) =>
    `wf-def:snapshot:${definitionId}:v${version}:${tenantId}`,
  workflowStates: (definitionId: string, tenantId: string) => `wf-def:states:${definitionId}:${tenantId}`,
  workflowTransitions: (definitionId: string, tenantId: string) =>
    `wf-def:transitions:${definitionId}:${tenantId}`,

  // Workflow Execution module
  allowedTransitions: (instanceId: string, tenantId: string) =>
    `wf-exec:allowed-transitions:${instanceId}:${tenantId}`,
  instanceDetail: (instanceId: string, tenantId: string) => `wf-exec:instance:${instanceId}:${tenantId}`,

  // Idempotency
  transitionIdempotency: (idempotencyKey: string, tenantId: string) =>
    `idempotency:transition:${idempotencyKey}:${tenantId}`,
  requestIdempotency: (idempotencyKey: string) => `idempotency:request:${idempotencyKey}`,

  // Rate limiting
  rateLimitUser: (userId: string, endpoint: string) => `rate-limit:user:${userId}:${endpoint}`,
  rateLimitTenant: (tenantId: string, endpoint: string) => `rate-limit:tenant:${tenantId}:${endpoint}`,
};
```

---

## TTL Reference Table

Define all TTLs as named constants — never use magic numbers in cache calls:

```typescript
// src/infra/cache-ttl.ts

export const CacheTTL = {
  // Workflow definitions change rarely — high TTL, explicit invalidation on publish
  WORKFLOW_DEFINITION: 5 * 60, // 5 minutes
  WORKFLOW_DEFINITION_LIST: 2 * 60, // 2 minutes (list changes more often than individual)
  WORKFLOW_VERSION_SNAPSHOT: 30 * 60, // 30 minutes — snapshots are immutable once created
  WORKFLOW_STATES: 5 * 60, // 5 minutes
  WORKFLOW_TRANSITIONS: 5 * 60, // 5 minutes

  // Execution — shorter TTL because instances change state
  ALLOWED_TRANSITIONS: 60, // 1 minute — instance can transition at any time
  INSTANCE_DETAIL: 30, // 30 seconds — stale instance state is dangerous

  // Auth — user data changes infrequently
  USER_SUMMARY: 10 * 60, // 10 minutes
  USER_ROLES: 10 * 60, // 10 minutes — invalidate on role assignment
  USER_LIST: 2 * 60, // 2 minutes

  // Tenant — settings change very rarely
  TENANT_SETTINGS: 15 * 60, // 15 minutes
  TENANT_FEATURE_FLAGS: 15 * 60, // 15 minutes
  TENANT_BY_ID: 15 * 60, // 15 minutes

  // Idempotency
  TRANSITION_IDEMPOTENCY: 24 * 60 * 60, // 24 hours — must outlive any reasonable retry window
  REQUEST_IDEMPOTENCY: 24 * 60 * 60, // 24 hours

  // Rate limiting
  RATE_LIMIT_WINDOW: 60, // 1 minute window
} as const;
```

---

## Module-by-Module Caching Implementation

---

### Module 1 — `src/modules/auth`

#### What to Cache

| Data                                | Cache Key                             | TTL    | Invalidate When                           |
| ----------------------------------- | ------------------------------------- | ------ | ----------------------------------------- |
| User summary (for contract queries) | `auth:user:<userId>:<tenantId>`       | 10 min | User updated, deactivated, roles changed  |
| User roles array                    | `auth:user-roles:<userId>:<tenantId>` | 10 min | Role assigned or revoked                  |
| User list per tenant                | `auth:user-list:<tenantId>`           | 2 min  | Any user created, updated, or deactivated |

#### Where to Implement

**`user-query.service.ts`** — this is the contract implementation. Cache goes here because this is the hot path called by other modules.

```typescript
// Pattern: cache-aside in user-query.service.ts

async findById(userId: string, tenantId: string): Promise<UserSummary | null> {
  const cacheKey = CacheKeys.userSummary(userId, tenantId);

  // 1. Try cache
  const cached = await this.redis.get<UserSummary>(cacheKey);
  if (cached) return cached;

  // 2. Miss — query DB
  const user = await this.userRepository.findSummaryById(userId, tenantId);
  if (!user) return null;

  // 3. Populate cache
  await this.redis.set(cacheKey, user, CacheTTL.USER_SUMMARY);
  return user;
}
```

**`user.service.ts`** — invalidation on writes:

```typescript
async deactivateUser(userId: string, tenantId: string): Promise<void> {
  await this.userRepository.deactivate(userId, tenantId);

  // Invalidate all related cache keys
  await Promise.allSettled([
    this.redis.del(CacheKeys.userSummary(userId, tenantId)),
    this.redis.del(CacheKeys.userRoles(userId, tenantId)),
    this.redis.del(CacheKeys.usersByTenant(tenantId)),
  ]);
}

async assignRoles(userId: string, tenantId: string, roleIds: string[]): Promise<void> {
  await this.userRepository.assignRoles(userId, tenantId, roleIds);

  await Promise.allSettled([
    this.redis.del(CacheKeys.userSummary(userId, tenantId)),
    this.redis.del(CacheKeys.userRoles(userId, tenantId)),
  ]);

  // Also publish USER_ROLES_UPDATED event so execution module can update its shadow table
  await this.authPublisher.publishUserRolesUpdated({ userId, tenantId, roles });
}
```

#### Cache in JWT Strategy

In `jwt.strategy.ts`, the `validate()` method currently hits the DB to verify the user is still active. Cache this check:

```typescript
async validate(payload: IJwtPayload): Promise<IJwtPayload> {
  const cacheKey = CacheKeys.userSummary(payload.sub, payload.tenantId);
  let user = await this.redis.get<UserSummary>(cacheKey);

  if (!user) {
    user = await this.userRepository.findSummaryById(payload.sub, payload.tenantId);
    if (user) await this.redis.set(cacheKey, user, CacheTTL.USER_SUMMARY);
  }

  if (!user || !user.isActive) {
    throw new UnauthorizedException();
  }

  return payload; // req.user = JWT payload, not the DB record
}
```

This eliminates a DB call on **every single authenticated request**.

---

### Module 2 — `src/modules/tenant`

#### What to Cache

| Data                           | Cache Key                         | TTL    | Invalidate When               |
| ------------------------------ | --------------------------------- | ------ | ----------------------------- |
| Tenant by ID                   | `tenant:by-id:<tenantId>`         | 15 min | Tenant updated or deactivated |
| Tenant settings                | `tenant:settings:<tenantId>`      | 15 min | Settings updated              |
| Feature flags (all for tenant) | `tenant:feature-flags:<tenantId>` | 15 min | Any flag toggled              |

#### Where to Implement

**`tenant-query.service.ts`** — contract implementation, hot path:

```typescript
async findById(tenantId: string): Promise<TenantSummary | null> {
  const cacheKey = CacheKeys.tenantById(tenantId);
  const cached = await this.redis.get<TenantSummary>(cacheKey);
  if (cached) return cached;

  const tenant = await this.tenantRepository.findById(tenantId);
  if (!tenant) return null;

  await this.redis.set(cacheKey, tenant, CacheTTL.TENANT_BY_ID);
  return tenant;
}

async isFeatureEnabled(tenantId: string, flagKey: string): Promise<boolean> {
  // Cache ALL flags for the tenant as a single object — one Redis call serves all flag checks
  const cacheKey = CacheKeys.tenantFeatureFlags(tenantId);
  let flags = await this.redis.get<Record<string, boolean>>(cacheKey);

  if (!flags) {
    const flagRecords = await this.featureFlagRepository.findAllByTenant(tenantId);
    flags = Object.fromEntries(flagRecords.map(f => [f.flagKey, f.isEnabled]));
    await this.redis.set(cacheKey, flags, CacheTTL.TENANT_FEATURE_FLAGS);
  }

  return flags[flagKey] ?? false;
}
```

**`tenant.service.ts`** — invalidation on writes:

```typescript
async updateFeatureFlag(tenantId: string, flagKey: string, isEnabled: boolean): Promise<void> {
  await this.featureFlagRepository.upsert(tenantId, flagKey, isEnabled);
  // Invalidate entire flags object — it will be rebuilt fresh on next request
  await this.redis.del(CacheKeys.tenantFeatureFlags(tenantId));
}

async updateSettings(tenantId: string, dto: UpdateSettingsDto): Promise<void> {
  await this.tenantSettingsRepository.update(tenantId, dto);
  await this.redis.del(CacheKeys.tenantSettings(tenantId));
}
```

---

### Module 3 — `src/modules/workflow-definition`

This is the **most important module to cache** — workflow definitions are read on every single transition execution, but they almost never change. Cache hit rate here should be close to 99%.

#### What to Cache

| Data                                                | Cache Key                              | TTL    | Invalidate When                                    |
| --------------------------------------------------- | -------------------------------------- | ------ | -------------------------------------------------- |
| Full definition (with states + transitions + rules) | `wf-def:definition:<id>:<tenantId>`    | 5 min  | Definition updated, state/transition added/removed |
| Definition list per tenant                          | `wf-def:definition-list:<tenantId>`    | 2 min  | Any definition created/updated/deleted             |
| Published version snapshot                          | `wf-def:snapshot:<id>:v<n>:<tenantId>` | 30 min | **Never** — snapshots are immutable once published |
| States for a definition                             | `wf-def:states:<id>:<tenantId>`        | 5 min  | State added/updated/deleted                        |
| Transitions for a definition                        | `wf-def:transitions:<id>:<tenantId>`   | 5 min  | Transition added/updated/deleted                   |

#### Where to Implement

**`workflow-query.service.ts`** — used by execution module on every transition:

```typescript
async getVersionSnapshot(
  definitionId: string,
  version: number,
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  // Snapshots are IMMUTABLE — once published, they never change
  // Cache them aggressively with a long TTL
  const cacheKey = CacheKeys.workflowVersionSnapshot(definitionId, version, tenantId);
  const cached = await this.redis.get<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const versionRecord = await this.versionRepository.findSnapshot(definitionId, version, tenantId);
  if (!versionRecord) return null;

  // Long TTL because snapshots never change
  await this.redis.set(cacheKey, versionRecord.snapshot, CacheTTL.WORKFLOW_VERSION_SNAPSHOT);
  return versionRecord.snapshot;
}

async findDefinitionById(
  definitionId: string,
  tenantId: string,
): Promise<WorkflowDefinitionSummary | null> {
  const cacheKey = CacheKeys.workflowDefinition(definitionId, tenantId);
  const cached = await this.redis.get<WorkflowDefinitionSummary>(cacheKey);
  if (cached) return cached;

  const definition = await this.definitionRepository.findWithStatesAndTransitions(definitionId, tenantId);
  if (!definition) return null;

  await this.redis.set(cacheKey, definition, CacheTTL.WORKFLOW_DEFINITION);
  return definition;
}
```

**`workflow-definition.service.ts`** — invalidation on every write:

```typescript
async addState(definitionId: string, tenantId: string, dto: CreateStateDto): Promise<WorkflowState> {
  const state = await this.stateRepository.create(definitionId, tenantId, dto);

  // Invalidate both the full definition cache and the states-specific cache
  await Promise.allSettled([
    this.redis.del(CacheKeys.workflowDefinition(definitionId, tenantId)),
    this.redis.del(CacheKeys.workflowStates(definitionId, tenantId)),
    this.redis.del(CacheKeys.workflowDefinitionList(tenantId)),
  ]);

  return state;
}

async addTransition(definitionId: string, tenantId: string, dto: CreateTransitionDto): Promise<WorkflowTransition> {
  const transition = await this.transitionRepository.create(definitionId, tenantId, dto);

  await Promise.allSettled([
    this.redis.del(CacheKeys.workflowDefinition(definitionId, tenantId)),
    this.redis.del(CacheKeys.workflowTransitions(definitionId, tenantId)),
    this.redis.del(CacheKeys.workflowDefinitionList(tenantId)),
  ]);

  return transition;
}

async deleteState(definitionId: string, stateId: string, tenantId: string): Promise<void> {
  await this.stateRepository.delete(stateId, tenantId);

  await Promise.allSettled([
    this.redis.del(CacheKeys.workflowDefinition(definitionId, tenantId)),
    this.redis.del(CacheKeys.workflowStates(definitionId, tenantId)),
    // Also invalidate allowed-transitions for ALL instances of this definition
    // since a deleted state may appear in running instances' transition options
    this.redis.delByPattern(`wf-exec:allowed-transitions:*:${tenantId}`),
  ]);
}
```

**`workflow-version.service.ts`** — on publish, do NOT invalidate the snapshot — create it:

```typescript
async publishDefinition(definitionId: string, tenantId: string, publishedBy: string): Promise<void> {
  // ... DB operations: create version snapshot, update definition status ...

  // Invalidate the mutable definition cache (status changed to 'published')
  await Promise.allSettled([
    this.redis.del(CacheKeys.workflowDefinition(definitionId, tenantId)),
    this.redis.del(CacheKeys.workflowDefinitionList(tenantId)),
    this.redis.del(CacheKeys.workflowStates(definitionId, tenantId)),
    this.redis.del(CacheKeys.workflowTransitions(definitionId, tenantId)),
    // NOTE: do NOT delete the snapshot cache — snapshots are immutable
    // The new snapshot will be cached on first read by execution module
  ]);
}
```

---

### Module 4 — `src/modules/workflow-execution`

#### What to Cache

| Data                                | Cache Key                                             | TTL      | Invalidate When                    |
| ----------------------------------- | ----------------------------------------------------- | -------- | ---------------------------------- |
| Allowed transitions for an instance | `wf-exec:allowed-transitions:<instanceId>:<tenantId>` | 60 sec   | Instance transitions to new state  |
| Instance detail (read model)        | `wf-exec:instance:<instanceId>:<tenantId>`            | 30 sec   | Instance transitions, is cancelled |
| Transition idempotency record       | `idempotency:transition:<key>:<tenantId>`             | 24 hours | Never (expiry-based)               |

#### Where to Implement

**`get-allowed-transitions.query.ts` handler:**

```typescript
async execute(query: GetAllowedTransitionsQuery): Promise<TransitionOption[]> {
  const { instanceId, tenantId, userRoles } = query;
  // NOTE: user roles are part of the cache key concept but since roles can change,
  // keep TTL short (60s) rather than caching per-role combination
  const cacheKey = CacheKeys.allowedTransitions(instanceId, tenantId);
  const cached = await this.redis.get<TransitionOption[]>(cacheKey);
  if (cached) {
    // Filter cached transitions by current user's roles — the filtering is cheap,
    // the expensive part (loading snapshot + transitions) is what we cache
    return this.filterByRoles(cached, userRoles);
  }

  // Load instance → load snapshot → compute all possible transitions from current state
  const instance = await this.instanceRepository.findById(instanceId, tenantId);
  const snapshot = await this.workflowQuery.getVersionSnapshot(
    instance.workflowDefinitionId,
    instance.definitionVersion,
    tenantId,
  );
  const allTransitions = this.computeAllowedTransitions(instance.currentStateName, snapshot);

  // Cache ALL transitions (before role filtering) — role filtering happens at read time
  await this.redis.set(cacheKey, allTransitions, CacheTTL.ALLOWED_TRANSITIONS);
  return this.filterByRoles(allTransitions, userRoles);
}
```

**`execute-transition.handler.ts`** — invalidate on successful transition:

```typescript
// Inside the handler, AFTER the DB transaction commits successfully:
async execute(command: ExecuteTransitionCommand): Promise<WorkflowInstance> {
  // ... validation, rule evaluation, DB transaction ...

  // Invalidate instance-specific cache entries
  await Promise.allSettled([
    this.redis.del(CacheKeys.allowedTransitions(command.instanceId, command.tenantId)),
    this.redis.del(CacheKeys.instanceDetail(command.instanceId, command.tenantId)),
  ]);

  // Publish NATS event (after successful cache invalidation)
  await this.executionPublisher.publishTransitionCompleted({ ...eventData });

  return updatedInstance;
}
```

#### Idempotency Cache for Transitions

This prevents the same transition from being executed twice if the client retries. Implement in `execute-transition.handler.ts`:

```typescript
async execute(command: ExecuteTransitionCommand): Promise<WorkflowInstance> {
  const { idempotencyKey, tenantId } = command;

  if (idempotencyKey) {
    const idempotencyCache = CacheKeys.transitionIdempotency(idempotencyKey, tenantId);

    // Check if this exact request was already processed
    const existingResult = await this.redis.get<WorkflowInstance>(idempotencyCache);
    if (existingResult) {
      // Return the cached result — same response as original request
      return existingResult;
    }

    // Try to claim this idempotency key atomically
    // setNX returns true if the key was set (we own it), false if it already existed
    const claimed = await this.redis.setNX(
      idempotencyCache + ':lock',
      command.performedByUserId,
      30, // 30 second processing lock
    );

    if (!claimed) {
      // Another request with the same key is currently being processed
      throw new ConflictException('DUPLICATE_REQUEST_IN_FLIGHT');
    }
  }

  // ... execute transition logic ...

  if (idempotencyKey) {
    // Store the successful result so retries return the same response
    await this.redis.set(
      CacheKeys.transitionIdempotency(idempotencyKey, tenantId),
      updatedInstance,
      CacheTTL.TRANSITION_IDEMPOTENCY,
    );
    // Release the processing lock
    await this.redis.del(CacheKeys.transitionIdempotency(idempotencyKey, tenantId) + ':lock');
  }

  return updatedInstance;
}
```

---

### Module 5 — Rate Limiting (Cross-Cutting — Implement in Middleware)

Rate limiting uses Redis `INCR` + `EXPIRE` (sliding counter pattern).

#### Create: `src/infra/middlewares/rate-limit.middleware.ts`

```typescript
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.sub;
    if (!tenantId || !userId) return next(); // unauthenticated — handled by JWT guard

    const endpoint = `${req.method}:${req.path}`;

    // Per-user rate limit (stricter)
    const userKey = CacheKeys.rateLimitUser(userId, endpoint);
    const userCount = await this.redis.incr(userKey);
    if (userCount === 1) await this.redis.expire(userKey, CacheTTL.RATE_LIMIT_WINDOW);
    if (userCount > RATE_LIMIT_PER_USER_PER_MINUTE) {
      throw new TooManyRequestsException("USER_RATE_LIMIT_EXCEEDED");
    }

    // Per-tenant rate limit (protects shared resources)
    const tenantKey = CacheKeys.rateLimitTenant(tenantId, endpoint);
    const tenantCount = await this.redis.incr(tenantKey);
    if (tenantCount === 1) await this.redis.expire(tenantKey, CacheTTL.RATE_LIMIT_WINDOW);
    if (tenantCount > RATE_LIMIT_PER_TENANT_PER_MINUTE) {
      throw new TooManyRequestsException("TENANT_RATE_LIMIT_EXCEEDED");
    }

    next();
  }
}
```

#### Rate Limit Constants

```typescript
// src/infra/rate-limit.constants.ts
export const RATE_LIMIT_PER_USER_PER_MINUTE = 120; // 2 req/sec sustained
export const RATE_LIMIT_PER_TENANT_PER_MINUTE = 600; // 10 req/sec sustained
```

Apply in `app.module.ts`:

```typescript
configure(consumer: MiddlewareConsumer): void {
  consumer
    .apply(RateLimitMiddleware)
    .exclude(
      { path: 'api/v1/auth/login', method: RequestMethod.POST },
      { path: 'api/v1/auth/refresh', method: RequestMethod.POST },
      { path: 'health', method: RequestMethod.GET },
    )
    .forRoutes('*');
}
```

---

### Module 6 — `src/modules/notification`

#### What to Cache

| Data                                | Cache Key                                   | TTL    | Invalidate When                          |
| ----------------------------------- | ------------------------------------------- | ------ | ---------------------------------------- |
| Notification templates for a tenant | `notif:templates:<tenantId>:<eventTrigger>` | 10 min | Template created, updated, deleted       |
| Active webhook configs for a tenant | `notif:webhooks:<tenantId>`                 | 10 min | Webhook config created, updated, deleted |

#### Where to Implement

**`notification.subscriber.ts`** — when a transition event is received, notification templates are looked up. Cache them:

```typescript
private async getTemplatesForEvent(tenantId: string, eventTrigger: string): Promise<NotificationTemplate[]> {
  const cacheKey = `notif:templates:${tenantId}:${eventTrigger}`;
  const cached = await this.redis.get<NotificationTemplate[]>(cacheKey);
  if (cached) return cached;

  const templates = await this.templateRepository.findActiveByTrigger(tenantId, eventTrigger);
  await this.redis.set(cacheKey, templates, 10 * 60);
  return templates;
}

private async getActiveWebhooks(tenantId: string): Promise<WebhookConfig[]> {
  const cacheKey = CacheKeys.tenantFeatureFlags(tenantId); // reuse tenant cache namespace
  // Actually use a dedicated key:
  const webhookKey = `notif:webhooks:${tenantId}`;
  const cached = await this.redis.get<WebhookConfig[]>(webhookKey);
  if (cached) return cached;

  const webhooks = await this.webhookConfigRepository.findActiveByTenant(tenantId);
  await this.redis.set(webhookKey, webhooks, 10 * 60);
  return webhooks;
}
```

**`notification-template.controller.ts`** — invalidation on CRUD:

```typescript
async createTemplate(tenantId: string, dto: CreateTemplateDto): Promise<NotificationTemplate> {
  const template = await this.templateRepository.create(tenantId, dto);
  await this.redis.del(`notif:templates:${tenantId}:${dto.eventTrigger}`);
  return template;
}
```

---

## Full `src/infra/redis.service.ts` Implementation

This is the complete Redis service the entire app depends on. Implement it fully:

```typescript
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(this.config.get<string>("REDIS_URL")!, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this.client.on("error", (err) => {
      this.logger.error("Redis connection error", err.message);
    });

    this.client.on("connect", () => {
      this.logger.log("Redis connected");
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (err) {
      this.logger.warn(`Redis GET failed for key ${key}`, err);
      return null; // graceful degradation
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis SET failed for key ${key}`, err);
      // Do not throw — cache failure must not fail the request
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(`Redis DEL failed for key ${key}`, err);
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    try {
      // Use SCAN instead of KEYS — safe for production
      let cursor = "0";
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== "0");
    } catch (err) {
      this.logger.warn(`Redis SCAN+DEL failed for pattern ${pattern}`, err);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (err) {
      this.logger.warn(`Redis EXISTS failed for key ${key}`, err);
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (err) {
      this.logger.warn(`Redis INCR failed for key ${key}`, err);
      return 0; // on failure, return 0 so rate limiting doesn't block
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis EXPIRE failed for key ${key}`, err);
    }
  }

  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.set(key, value, "EX", ttlSeconds, "NX");
      return result === "OK";
    } catch (err) {
      this.logger.warn(`Redis SET NX failed for key ${key}`, err);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
```

---

## `src/infra/infra.module.ts` — Register Redis Globally

```typescript
@Global() // ← Global module — RedisService injectable everywhere without importing InfraModule
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class InfraModule {}
```

Import `InfraModule` once in `AppModule`. After that, every module can inject `RedisService` directly via constructor injection without any additional module imports.

---

## Cache Health Check

In `src/modules/health/health.controller.ts`, add Redis to the health indicators:

```typescript
@Get()
async check(): Promise<HealthCheckResult> {
  return this.health.check([
    () => this.db.pingCheck('postgresql'),
    () => this.redis.pingCheck('redis'),    // ← add this
    () => this.nats.pingCheck('nats'),
  ]);
}
```

The Redis health check should attempt a `PING` command and return `{ status: 'up' }` or `{ status: 'down' }` — never throw and never fail the overall health check (Redis being down is degraded, not dead).

---

## Files to Create / Modify — Checklist

### New Files to Create

```
src/infra/redis.service.ts              ← full implementation above
src/infra/cache-keys.ts                 ← CacheKeys object (all key builder functions)
src/infra/cache-ttl.ts                  ← CacheTTL constants
src/infra/rate-limit.constants.ts       ← RATE_LIMIT_PER_USER, RATE_LIMIT_PER_TENANT
src/infra/middlewares/
  └── rate-limit.middleware.ts          ← Redis INCR-based sliding window rate limiter
src/infra/infra.module.ts               ← @Global() module that provides RedisService
```

### Files to Modify (Add Cache Logic)

```
src/modules/auth/services/user-query.service.ts       ← cache-aside on findById, findManyByIds
src/modules/auth/services/user.service.ts              ← invalidate on update, deactivate, assignRoles
src/modules/auth/strategies/jwt.strategy.ts            ← cache user active check

src/modules/tenant/services/tenant-query.service.ts   ← cache-aside on findById, isFeatureEnabled
src/modules/tenant/services/tenant.service.ts          ← invalidate on settings/flags update

src/modules/workflow-definition/services/
  workflow-query.service.ts                            ← cache-aside on findDefinitionById, getVersionSnapshot
  workflow-definition.service.ts                       ← invalidate on all CRUD ops
  workflow-state.service.ts                            ← invalidate definition + states cache
  workflow-transition.service.ts                       ← invalidate definition + transitions cache
  workflow-version.service.ts                          ← invalidate mutable caches on publish (NOT snapshot)

src/modules/workflow-execution/handlers/
  execute-transition.handler.ts                        ← idempotency check + invalidate on success
  get-allowed-transitions.handler.ts                   ← cache-aside for allowed transitions

src/modules/notification/subscribers/
  notification.subscriber.ts                           ← cache templates + webhooks lookup

src/modules/notification/controllers/
  notification-template.controller.ts                  ← invalidate on CRUD
  webhook-config.controller.ts                         ← invalidate on CRUD

src/modules/health/health.controller.ts                ← add Redis ping check

src/app.module.ts                                      ← import InfraModule, apply RateLimitMiddleware
```

---

## Cache Invalidation Map (Complete Reference)

Use this as a checklist — every write operation must hit the corresponding invalidation:

| Trigger (Write Event)                         | Cache Keys to Invalidate                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| User created                                  | `auth:user-list:<tenantId>`                                                                                                                     |
| User updated                                  | `auth:user:<userId>:<tenantId>`, `auth:user-list:<tenantId>`                                                                                    |
| User deactivated                              | `auth:user:<userId>:<tenantId>`, `auth:user-roles:<userId>:<tenantId>`, `auth:user-list:<tenantId>`                                             |
| User roles assigned/revoked                   | `auth:user:<userId>:<tenantId>`, `auth:user-roles:<userId>:<tenantId>`                                                                          |
| Tenant updated                                | `tenant:by-id:<tenantId>`                                                                                                                       |
| Tenant settings updated                       | `tenant:settings:<tenantId>`                                                                                                                    |
| Feature flag toggled                          | `tenant:feature-flags:<tenantId>`                                                                                                               |
| Workflow definition created                   | `wf-def:definition-list:<tenantId>`                                                                                                             |
| Workflow definition updated                   | `wf-def:definition:<id>:<tenantId>`, `wf-def:definition-list:<tenantId>`                                                                        |
| Workflow definition published                 | `wf-def:definition:<id>:<tenantId>`, `wf-def:definition-list:<tenantId>`, `wf-def:states:<id>:<tenantId>`, `wf-def:transitions:<id>:<tenantId>` |
| Workflow definition deprecated                | Same as published                                                                                                                               |
| Workflow definition deleted                   | Same as published + pattern `wf-exec:allowed-transitions:*:<tenantId>`                                                                          |
| State added to definition                     | `wf-def:definition:<id>:<tenantId>`, `wf-def:states:<id>:<tenantId>`, `wf-def:definition-list:<tenantId>`                                       |
| State updated                                 | Same as state added                                                                                                                             |
| State deleted                                 | Same as state added + pattern `wf-exec:allowed-transitions:*:<tenantId>`                                                                        |
| Transition added                              | `wf-def:definition:<id>:<tenantId>`, `wf-def:transitions:<id>:<tenantId>`, `wf-def:definition-list:<tenantId>`                                  |
| Transition updated                            | Same as transition added + pattern `wf-exec:allowed-transitions:*:<tenantId>`                                                                   |
| Transition deleted                            | Same as transition updated                                                                                                                      |
| Rule added/updated/deleted on transition      | `wf-def:definition:<id>:<tenantId>`, `wf-def:transitions:<id>:<tenantId>` + pattern `wf-exec:allowed-transitions:*:<tenantId>`                  |
| Instance transitioned                         | `wf-exec:allowed-transitions:<instanceId>:<tenantId>`, `wf-exec:instance:<instanceId>:<tenantId>`                                               |
| Instance cancelled                            | `wf-exec:allowed-transitions:<instanceId>:<tenantId>`, `wf-exec:instance:<instanceId>:<tenantId>`                                               |
| Notification template created/updated/deleted | `notif:templates:<tenantId>:<eventTrigger>`                                                                                                     |
| Webhook config created/updated/deleted        | `notif:webhooks:<tenantId>`                                                                                                                     |

---

## What Is Intentionally NOT Cached

Document this explicitly so the agent doesn't over-cache:

| Data                                                  | Why Not Cached                                                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit logs                                            | Append-only write path, not a read-heavy pattern. Individual log entries are queried once per page view — not worth the cache management complexity |
| Workflow instance `payload` (business data)           | Payload changes on every transition. Cache hit rate would be very low. The short 30s `instanceDetail` cache handles the brief re-read window        |
| Refresh tokens                                        | Security-sensitive. Revocation must be immediately effective. Caching refresh tokens risks allowing revoked tokens to remain valid during TTL       |
| User passwords                                        | Never. Ever.                                                                                                                                        |
| Transition rule `rule_definition` JSONB independently | Already included in the `workflowVersionSnapshot` cache — no need to cache separately                                                               |
| Notification logs                                     | Write-heavy, not queried in hot paths                                                                                                               |

---

## Testing Caching Behavior

For each cached module, write the following tests:

### Unit Test Pattern for Cache-Aside

```typescript
describe("cache-aside behavior", () => {
  it("returns cached value without hitting DB on second call", async () => {
    // First call — miss
    mockRedis.get.mockResolvedValueOnce(null);
    mockRepository.findById.mockResolvedValueOnce(mockEntity);
    await service.findById(id, tenantId);

    // Second call — hit
    mockRedis.get.mockResolvedValueOnce(mockEntity);
    await service.findById(id, tenantId);

    expect(mockRepository.findById).toHaveBeenCalledTimes(1); // DB called only once
    expect(mockRedis.get).toHaveBeenCalledTimes(2);
  });

  it("falls back to DB if Redis throws", async () => {
    mockRedis.get.mockRejectedValueOnce(new Error("Redis connection lost"));
    mockRepository.findById.mockResolvedValueOnce(mockEntity);

    const result = await service.findById(id, tenantId);
    expect(result).toEqual(mockEntity); // graceful degradation
  });
});
```

### Integration Test for Invalidation

```typescript
it("invalidates cache when definition is published", async () => {
  // Seed cache
  await redis.set(CacheKeys.workflowDefinition(id, tenantId), mockDef, 300);

  // Trigger invalidation
  await workflowVersionService.publishDefinition(id, tenantId, userId);

  // Verify cache is gone
  const cached = await redis.get(CacheKeys.workflowDefinition(id, tenantId));
  expect(cached).toBeNull();
});
```

---

## Final Checklist — Caching Layer Complete

Before declaring caching implementation done, verify:

- [ ] `RedisService` created with all methods: `get`, `set`, `del`, `delByPattern`, `exists`, `incr`, `expire`, `setNX`
- [ ] `InfraModule` is `@Global()` and exports `RedisService`
- [ ] `CacheKeys` object created with all key builder functions
- [ ] `CacheTTL` constants created with all TTL values
- [ ] No cache key is constructed inline — all go through `CacheKeys.*`
- [ ] No TTL is a magic number — all use `CacheTTL.*`
- [ ] Every cache key includes `tenantId` where applicable
- [ ] Every `get` is wrapped with null-check fallback to DB
- [ ] Every Redis operation is wrapped in try/catch with `logger.warn` — never throws
- [ ] Every write operation in every service has the corresponding cache invalidation
- [ ] Idempotency for transitions uses `setNX` pattern
- [ ] Rate limiting middleware applies to all authenticated endpoints
- [ ] Rate limiting uses `INCR` + `EXPIRE`, never a fixed window reset
- [ ] `delByPattern` uses `SCAN` — never `KEYS`
- [ ] Snapshot cache (`wf-def:snapshot:*`) is NEVER explicitly deleted (immutable)
- [ ] Refresh tokens are NOT cached
- [ ] Health check includes Redis ping
- [ ] Unit tests cover: cache hit, cache miss, Redis failure fallback
- [ ] Integration tests cover: write → invalidation → next read misses cache
