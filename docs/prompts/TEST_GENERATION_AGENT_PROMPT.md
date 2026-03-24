# 🤖 AI Agent Prompt — Test Case Generation
## Multi-Tenant Workflow Engine (NestJS)

---

## ⚠️ MANDATORY OPERATIONAL RULES — READ BEFORE GENERATING A SINGLE LINE

```
1. GENERATE TESTS MODULE BY MODULE ONLY.
   Wait for the human to specify a module name before generating anything.
   Do not generate tests for any other module unless explicitly instructed.

2. DO NOT MODIFY ANY EXISTING SOURCE FILE.
   No changes to services, controllers, entities, guards, interceptors, DTOs,
   repositories, or any other production code. Test files only.

3. WITHIN EACH MODULE, GENERATE IN THIS EXACT ORDER:
   a) Service spec files (one per service)
   b) Controller spec files (one per controller)
   c) Handler spec files (CQRS handlers, if the module uses @nestjs/cqrs)
   d) Subscriber spec files (NATS event subscribers, if present)
   e) Repository spec files (only for complex query methods, skip trivial CRUD)

4. E2E TESTS COME AFTER ALL UNIT TESTS FOR ALL MODULES ARE APPROVED.
   Do not generate e2e specs until explicitly told "Begin E2E Generation".

5. WAIT FOR APPROVAL AFTER EACH MODULE.
   After generating unit tests for a module, stop. Do not proceed to the next
   module or to e2e tests until the human explicitly says "Approved" or
   "Generate [module name]".

6. TARGET: MINIMUM 85% LINE AND BRANCH COVERAGE per module.
   Cover happy paths, all error branches, edge cases, and guard/interceptor
   interactions.
```

---

## 1. Project Architecture (Ground Truth)

This is a **Multi-Tenant Workflow Engine SaaS** built as a **Microservice-Extractable
Contract-First Modular Monolith** using NestJS.

### 1.1 Runtime & Framework

| Concern | Detail |
|---|---|
| Runtime | **Bun** |
| Framework | **NestJS 10** |
| Language | **TypeScript (strict mode, no `any`)** |
| ORM | **TypeORM 0.3.x** |
| Database | **PostgreSQL** |
| Cache | **Redis** (ioredis) |
| Messaging | **NATS** |
| Auth | **JWT (passport-jwt) + Argon2** |
| Rule Engine | **json-rules-engine 7.x** |
| CLS | **nest-cls** (ClsService / AsyncLocalStorage) |
| CQRS | **@nestjs/cqrs** (WorkflowExecution module only) |

### 1.2 Full Directory Structure

```
src/
  infra/
    cache-keys.ts              ← CacheKeys constants
    cache-ttl.ts               ← CacheTTL constants
    redis.service.ts           ← RedisService (get/set/del/setNX/delByPattern)
    nats.config.ts             ← NATS_CLIENT token + createNatsOptions()
    infra.module.ts
    middlewares/
      enhanced-rate-limit.middleware.ts  ← leaky-bucket per-tenant rate limiter
  modules/
    audit/
    auth/
    dashboard/
    database/
      interceptors/
        database-context.interceptor.ts
      services/
        rls-context.service.ts
      database.module.ts
    health/
    notification/
    rule-engine/
    tenant/
    workflow-definition/
    workflow-execution/
  app.module.ts
  main.ts

libs/
  shared/
    src/
      constants/
        app-errors.enum.ts     ← AppErrors enum (all business error codes)
        nats-events.enum.ts    ← NatsEvents enum
        default-system-roles.enum.ts
      decorators/
        current-user.decorator.ts   ← @CurrentUser()
        public.decorator.ts         ← @Public()
        roles.decorator.ts          ← @Roles()
        tenant-id.decorator.ts      ← @TenantId()
      dto/
        base-response.dto.ts        ← ApiResponseDto, CountApiResponseDto
        pagination.dto.ts
        id-param.dto.ts
      entities/
        base.entity.ts              ← BaseEntity (id, tenantId, createdAt, updatedAt)
      filters/
        global-exception.filter.ts  ← GlobalExceptionFilter
      guards/
        jwt-auth.guard.ts           ← JwtAuthGuard (skips @Public())
        tenant-isolation.guard.ts   ← TenantIsolationGuard
        roles.guard.ts              ← RolesGuard
      interceptors/
        logging.interceptor.ts
        tenant-context.interceptor.ts
        transform.interceptor.ts
      interfaces/
        contracts/
          user-query.contract.ts        ← USER_QUERY_CONTRACT, IUserQueryContract
          tenant-query.contract.ts      ← TENANT_QUERY_CONTRACT, ITenantQueryContract
          workflow-query.contract.ts    ← WORKFLOW_QUERY_CONTRACT, IWorkflowQueryContract
          workflow-execution-query.contract.ts
          rule-engine.contract.ts       ← RULE_ENGINE_CONTRACT, IRuleEngineContract
          notification-template-bootstrap.contract.ts
          tenant-provisioning.contract.ts
        events/
          auth-events.interface.ts
          tenant-events.interface.ts
          workflow-events.interface.ts
        jwt-payload.interface.ts        ← IJwtPayload shape
      utils/
        argon2.ts / hash.ts
        uuid.util.ts
        pagination.ts
      test-utils/                      ← YOU WILL CREATE THIS (see Section 5)
        mocks/
          ...
```

---

## 2. The Updated Database Connection & RLS Architecture

> **This is the most critical section. All test mocking must respect this architecture.**

### 2.1 Connection Model

```
Single PostgreSQL database
Single application DB user (e.g., `app_user`)
Two PostgreSQL roles:
  - tenant_user   → used for all tenant-scoped API requests
  - public_user   → used for public/unauthenticated requests
app_user has been GRANTed both roles.
```

### 2.2 Request Lifecycle — How Context Is Set

Every authenticated request goes through this exact pipeline:

```
HTTP Request
    │
    ▼
[ ThrottlerGuard ]          → global rate limit (memory-based backup)
    │
    ▼
[ EnhancedRateLimitMiddleware ] → per-tenant leaky bucket (Redis)
    │
    ▼
[ JwtAuthGuard ]            → validates Bearer token, populates req.user (IJwtPayload)
    │
    ▼
[ TenantIsolationGuard ]    → ensures req.user.tenantId exists, sets req.tenantId
    │
    ▼
[ RolesGuard ]              → checks @Roles() metadata against req.user.roles
    │
    ▼
[ ClassSerializerInterceptor ]
[ LoggingInterceptor ]
[ TenantContextInterceptor ]  → copies tenantId onto request context
    │
    ▼
[ DatabaseContextInterceptor ]
    │   ├─ Retrieves tenantId from req.user.tenantId
    │   ├─ Calls RlsContextService.setTenantContext(tenantId)
    │   │     → executes: SET ROLE tenant_user;
    │   │     → executes: SET app.tenant_id = '<tenantId>';
    │   ├─ Initialises a CLS (nest-cls) context
    │   ├─ Creates a TypeORM QueryRunner and stores it in ClsService
    │   │     → ClsService.set('queryRunner', queryRunner)
    │   ├─ Starts a transaction on the QueryRunner
    │   └─ On response/error: commits or rolls back, then clears RLS context
    │         → executes: RESET ROLE;
    │         → executes: RESET app.tenant_id;
    │
    ▼
[ Controller → Service → Repository ]
    All repositories retrieve the shared QueryRunner from ClsService:
      const qr = this.cls.get('queryRunner');
      const result = await qr.manager.find(Entity, { where: { tenantId } });
    
    RLS policies ALSO enforce tenant_id = current_setting('app.tenant_id')
    at the PostgreSQL row level — defence in depth.
    │
    ▼
HTTP Response
```

### 2.3 PostgreSQL Roles (Exact Setup — Use Everywhere)

```
workflow_app    → the single DB login user (application user, no BYPASSRLS)
  ├── tenant_user   → SET ROLE for all authenticated, tenant-scoped requests
  ├── public_user   → SET ROLE for all @Public() unauthenticated requests
  └── superadmin    → BYPASSRLS ✓  (used for admin/migration operations only)
```

`workflow_app` has been granted all three roles via `GRANT tenant_user TO workflow_app` etc.
`superadmin` is the only role with `BYPASSRLS` — all others are subject to RLS policies.

### 2.4 Public Route Lifecycle

For routes decorated with `@Public()`:
- `JwtAuthGuard` is skipped
- `DatabaseContextInterceptor` calls `RlsContextService.setPublicContext()`
  which executes `SET ROLE public_user;` (no tenant filter)
- ClsService still provides a QueryRunner for transactional consistency

### 2.5 Key Services to Mock in Unit Tests (Unit Tests Only — Not E2E)

```typescript
// ClsService (nest-cls) — carries the QueryRunner across async boundaries
import { ClsService } from 'nestjs-cls';
// Mock: cls.get('queryRunner') must return a mocked QueryRunner / EntityManager

// RlsContextService — sets PostgreSQL session variables
// Mock: setTenantContext(), clearTenantContext(), setPublicContext()

// RedisService — caching and rate limiting
// Mock: get(), set(), del(), setNX(), delByPattern()

// EntityManager / QueryRunner (TypeORM)
// Mock: manager.find(), manager.findOne(), manager.save(), manager.query()
```

---

## 3. Module Catalogue

When a module name is given, use this reference to know exactly what files to test:

| Module | Path | Has CQRS | Has NATS Publisher | Has NATS Subscriber |
|---|---|---|---|---|
| `auth` | `src/modules/auth/` | No | Yes (`auth.publisher.ts`) | No |
| `tenant` | `src/modules/tenant/` | No | Yes (`tenant.publisher.ts`) | No |
| `workflow-definition` | `src/modules/workflow-definition/` | No | Yes (`workflow-definition.publisher.ts`) | No |
| `workflow-execution` | `src/modules/workflow-execution/` | **Yes** | Yes (`execution.publisher.ts`) | Yes (`auth-events.subscriber.ts`) |
| `audit` | `src/modules/audit/` | No | No | Yes (`audit.subscriber.ts`) |
| `notification` | `src/modules/notification/` | No | No | Yes (`notification.subscriber.ts`) |
| `rule-engine` | `src/modules/rule-engine/` | No | No | No |
| `dashboard` | `src/modules/dashboard/` | No | No | No |
| `database` | `src/modules/database/` | No | No | No |

---

## 4. IJwtPayload Shape (Canonical — Use Exactly)

```typescript
// libs/shared/src/interfaces/jwt-payload.interface.ts
export interface IJwtPayload {
  readonly sub: string;           // User UUID
  readonly email: string;
  readonly tenantId: string;      // Tenant UUID — ALWAYS from JWT, never from body
  readonly tenantSlug: string;
  readonly roles: string[];       // e.g. ['Admin', 'Approver']
  readonly roleIds: string[];     // UUID array matching roles[]
  readonly plan: string;          // 'free' | 'pro' | 'enterprise'
  readonly firstName: string;
}
```

---

## 5. Shared Mock Infrastructure — CREATE THIS FIRST

**Before generating any module test, create the shared mock infrastructure below.**
**This happens once. All subsequent module tests import from here.**

### 5.1 Folder to Create

```
libs/shared/src/test-utils/        ← unit test shared mocks (imported by .spec.ts files)
  mocks/
    uuid.constants.ts           ← All UUIDs used across the entire test suite
    jwt-payload.mock.ts         ← mockAdminJwt, mockApproverJwt, mockRequestorJwt
    user.mock.ts                ← MockUser, MockRole, MockUserRole entities
    tenant.mock.ts              ← MockTenant, MockTenantSettings, MockFeatureFlag
    workflow.mock.ts            ← MockDefinition, MockState, MockTransition, MockRule, MockInstance
    audit.mock.ts               ← MockAuditLog
    notification.mock.ts        ← MockNotificationTemplate, MockWebhookConfig
    redis.mock.ts               ← createMockRedisService()
    cls.mock.ts                 ← createMockClsService()
    rls-context.mock.ts         ← createMockRlsContextService()
    query-runner.mock.ts        ← createMockQueryRunner(), createMockEntityManager()
    repository.mock.ts          ← Generic createMockRepository<T>()
    nats-client.mock.ts         ← createMockNatsClient()
  index.ts                      ← barrel export of all unit-test mocks

test/                              ← e2e test root (all e2e files live here)
  setup.ts                     ← global app lifecycle: beforeAll / afterEach / afterAll
  mocks.ts                     ← mockMailerService + mockConfigService (e2e-level)
  global.d.ts                  ← declares global.app: INestApplication
  jest-e2e.json                ← jest e2e config — setupFilesAfterEnv points to setup.ts
  *.e2e-spec.ts                ← one spec file per module, uses global.app
```

### 5.2 uuid.constants.ts — Canonical UUIDs (Use Everywhere)

```typescript
// libs/shared/src/test-utils/mocks/uuid.constants.ts

export const TEST_IDS = {
  // Tenants
  TENANT_A_ID: 'aaaaaaaa-0000-4000-8000-000000000001',
  TENANT_B_ID: 'aaaaaaaa-0000-4000-8000-000000000002',

  // Users
  ADMIN_USER_ID: 'bbbbbbbb-0000-4000-8000-000000000001',
  APPROVER_USER_ID: 'bbbbbbbb-0000-4000-8000-000000000002',
  REQUESTOR_USER_ID: 'bbbbbbbb-0000-4000-8000-000000000003',

  // Roles
  ADMIN_ROLE_ID: 'cccccccc-0000-4000-8000-000000000001',
  APPROVER_ROLE_ID: 'cccccccc-0000-4000-8000-000000000002',
  REQUESTOR_ROLE_ID: 'cccccccc-0000-4000-8000-000000000003',

  // Workflow Definitions
  WORKFLOW_DEFINITION_ID: 'dddddddd-0000-4000-8000-000000000001',
  WORKFLOW_DEFINITION_ID_2: 'dddddddd-0000-4000-8000-000000000002',

  // Workflow States
  INITIAL_STATE_ID: 'eeeeeeee-0000-4000-8000-000000000001',
  INTERMEDIATE_STATE_ID: 'eeeeeeee-0000-4000-8000-000000000002',
  TERMINAL_STATE_ID: 'eeeeeeee-0000-4000-8000-000000000003',

  // Workflow Transitions
  TRANSITION_ID: 'ffffffff-0000-4000-8000-000000000001',
  TRANSITION_ID_2: 'ffffffff-0000-4000-8000-000000000002',

  // Workflow Instances
  INSTANCE_ID: '11111111-0000-4000-8000-000000000001',
  INSTANCE_ID_2: '11111111-0000-4000-8000-000000000002',

  // Rules
  RULE_ID: '22222222-0000-4000-8000-000000000001',

  // Audit
  AUDIT_LOG_ID: '33333333-0000-4000-8000-000000000001',
  EVENT_ID: '44444444-0000-4000-8000-000000000001',

  // Notification / Webhook
  NOTIFICATION_TEMPLATE_ID: '55555555-0000-4000-8000-000000000001',
  WEBHOOK_CONFIG_ID: '66666666-0000-4000-8000-000000000001',

  // Refresh Token
  REFRESH_TOKEN_ID: '77777777-0000-4000-8000-000000000001',
} as const;
```

### 5.3 jwt-payload.mock.ts

```typescript
// libs/shared/src/test-utils/mocks/jwt-payload.mock.ts
import { IJwtPayload } from '../../interfaces/jwt-payload.interface';
import { TEST_IDS } from './uuid.constants';

export const mockAdminJwt: IJwtPayload = {
  sub: TEST_IDS.ADMIN_USER_ID,
  email: 'admin@acme.com',
  firstName: 'Jane',
  tenantId: TEST_IDS.TENANT_A_ID,
  tenantSlug: 'acme-corp',
  roles: ['Admin'],
  roleIds: [TEST_IDS.ADMIN_ROLE_ID],
  plan: 'pro',
};

export const mockApproverJwt: IJwtPayload = {
  sub: TEST_IDS.APPROVER_USER_ID,
  email: 'approver@acme.com',
  firstName: 'John',
  tenantId: TEST_IDS.TENANT_A_ID,
  tenantSlug: 'acme-corp',
  roles: ['Approver'],
  roleIds: [TEST_IDS.APPROVER_ROLE_ID],
  plan: 'pro',
};

export const mockRequestorJwt: IJwtPayload = {
  sub: TEST_IDS.REQUESTOR_USER_ID,
  email: 'requestor@acme.com',
  firstName: 'Bob',
  tenantId: TEST_IDS.TENANT_A_ID,
  tenantSlug: 'acme-corp',
  roles: ['Requestor'],
  roleIds: [TEST_IDS.REQUESTOR_ROLE_ID],
  plan: 'pro',
};
```

### 5.4 query-runner.mock.ts

```typescript
// libs/shared/src/test-utils/mocks/query-runner.mock.ts

export const createMockEntityManager = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  query: jest.fn(),
  getRepository: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getMany: jest.fn(),
    getOne: jest.fn(),
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
  })),
});

export const createMockQueryRunner = () => {
  const manager = createMockEntityManager();
  return {
    manager,
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query: jest.fn(),
    isTransactionActive: true,
  };
};
```

### 5.5 cls.mock.ts

```typescript
// libs/shared/src/test-utils/mocks/cls.mock.ts
import { createMockQueryRunner } from './query-runner.mock';

export const createMockClsService = () => {
  const store = new Map<string, unknown>();
  const qr = createMockQueryRunner();
  store.set('queryRunner', qr);

  return {
    get: jest.fn((key: string) => store.get(key)),
    set: jest.fn((key: string, value: unknown) => store.set(key, value)),
    run: jest.fn((fn: () => unknown) => fn()),
    _mockQueryRunner: qr,   // expose for assertions in tests
  };
};
```

### 5.6 rls-context.mock.ts

```typescript
// libs/shared/src/test-utils/mocks/rls-context.mock.ts

export const createMockRlsContextService = () => ({
  setTenantContext: jest.fn().mockResolvedValue(undefined),
  clearTenantContext: jest.fn().mockResolvedValue(undefined),
  setPublicContext: jest.fn().mockResolvedValue(undefined),
  getCurrentTenantContext: jest.fn().mockResolvedValue(null),
  withTenantContext: jest.fn((tenantId: string, fn: () => unknown) => fn()),
  bypassRls: jest.fn((fn: () => unknown) => fn()),
});
```

### 5.7 redis.mock.ts

```typescript
// libs/shared/src/test-utils/mocks/redis.mock.ts

export const createMockRedisService = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  setNX: jest.fn().mockResolvedValue(true),
  exists: jest.fn().mockResolvedValue(false),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(undefined),
  delByPattern: jest.fn().mockResolvedValue(undefined),
  getClient: jest.fn(),
});
```

### 5.8 repository.mock.ts

```typescript
// libs/shared/src/test-utils/mocks/repository.mock.ts

export const createMockRepository = <T = unknown>() => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  findAndCount: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  softDelete: jest.fn(),
  count: jest.fn(),
  exists: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getMany: jest.fn(),
    getOne: jest.fn(),
    getCount: jest.fn(),
  })),
  manager: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
});
```

### 5.9 nats-client.mock.ts

```typescript
// libs/shared/src/test-utils/mocks/nats-client.mock.ts

export const createMockNatsClient = () => ({
  emit: jest.fn().mockReturnValue({ toPromise: jest.fn().mockResolvedValue(undefined) }),
  send: jest.fn().mockReturnValue({ toPromise: jest.fn().mockResolvedValue(undefined) }),
  publish: jest.fn().mockResolvedValue(undefined),
});
```

---

## 6. Unit Test Generation Rules

### 6.1 File Naming Convention

```
src/modules/<module>/services/<name>.service.spec.ts
src/modules/<module>/controllers/<name>.controller.spec.ts
src/modules/<module>/handlers/<name>.handler.spec.ts
src/modules/<module>/subscribers/<name>.subscriber.spec.ts
src/modules/<module>/repositories/<name>.repository.spec.ts
```

### 6.2 Standard Unit Test Structure

Every spec file must follow this template:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { <ServiceUnderTest> } from './<name>.service';
import {
  createMockRedisService,
  createMockClsService,
  createMockRlsContextService,
  createMockRepository,
  createMockNatsClient,
  mockAdminJwt,
  mockApproverJwt,
  mockRequestorJwt,
  TEST_IDS,
  // import relevant entity mocks
} from '@app/shared/test-utils';

describe('<ServiceName>', () => {
  let service: <ServiceUnderTest>;
  let mockCls: ReturnType<typeof createMockClsService>;
  let mockRedis: ReturnType<typeof createMockRedisService>;
  // ... other mocks

  beforeEach(async () => {
    mockCls = createMockClsService();
    mockRedis = createMockRedisService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        <ServiceUnderTest>,
        { provide: ClsService, useValue: mockCls },
        { provide: RedisService, useValue: mockRedis },
        // ... other providers
      ],
    }).compile();

    service = module.get<<ServiceUnderTest>>(<ServiceUnderTest>);
  });

  afterEach(() => jest.clearAllMocks());

  describe('<methodName>', () => {
    it('should <happy path description>', async () => {
      // Arrange
      // Act
      // Assert
    });

    it('should throw <ErrorType> when <condition>', async () => {
      // Arrange
      // Act & Assert
      await expect(service.method(...)).rejects.toThrow(<ErrorType>);
    });
  });
});
```

### 6.3 What MUST Be Tested Per Service

For every public method:
- ✅ Happy path with valid inputs and expected return value
- ✅ Each `throw` branch — every `NotFoundException`, `ConflictException`, `UnprocessableEntityException`, `ForbiddenException`, `BadRequestException`
- ✅ Cache hit path (when Redis returns a cached value, DB should NOT be called)
- ✅ Cache miss path (when Redis returns null, DB is called and result is cached)
- ✅ Cache invalidation (verify `redis.del()` is called with the correct `CacheKeys.*` after mutations)
- ✅ NATS event publication (verify publisher methods are called with correct payloads)
- ✅ Optimistic lock conflict (for `ExecuteTransitionHandler` — when `UPDATE` returns 0 rows affected)
- ✅ Idempotency key behaviour (duplicate key returns cached result without re-executing)
- ✅ Transaction rollback on error (verify `queryRunner.rollbackTransaction()` is called)

### 6.4 QueryRunner Access Pattern in Repositories

Repositories get the QueryRunner from ClsService. Mock this correctly:

```typescript
// In a repository test, the repo uses:
//   const qr = this.cls.get<QueryRunner>('queryRunner');
//   qr.manager.find(Entity, { where: ... })
//
// In your test:
const { _mockQueryRunner } = mockCls;
_mockQueryRunner.manager.find.mockResolvedValue([mockEntityInstance]);

// Then call the method and assert:
const result = await repository.findByTenantId(TEST_IDS.TENANT_A_ID);
expect(_mockQueryRunner.manager.find).toHaveBeenCalledWith(
  Entity,
  expect.objectContaining({ where: { tenantId: TEST_IDS.TENANT_A_ID } })
);
```

### 6.5 Controller Unit Tests

Controllers must be tested with `@nestjs/testing` and mocked services:

```typescript
describe('<ControllerName>', () => {
  let controller: <ControllerName>;
  let mockService: jest.Mocked<<ServiceName>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [<ControllerName>],
      providers: [
        {
          provide: <ServiceName>,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            // ... all methods
          },
        },
      ],
    })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
    .overrideGuard(TenantIsolationGuard).useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
    .compile();

    controller = module.get(<ControllerName>);
    mockService = module.get(<ServiceName>);
  });

  it('should call service.create() and return ApiResponseDto', async () => {
    mockService.create.mockResolvedValue(mockEntity);
    const result = await controller.create(mockAdminJwt, dto);
    expect(result).toEqual({ status: 'success', data: mockEntity });
    expect(mockService.create).toHaveBeenCalledWith(dto, mockAdminJwt.tenantId, mockAdminJwt.sub);
  });
});
```

### 6.6 CQRS Handler Tests (WorkflowExecution Module Only)

```typescript
// ExecuteTransitionHandler is a CommandHandler.
// It does NOT get services injected via NestJS DI in tests.
// Instantiate it directly:

describe('ExecuteTransitionHandler', () => {
  let handler: ExecuteTransitionHandler;
  let mockInstanceRepo: ReturnType<typeof createMockRepository>;
  let mockWorkflowQuery: jest.Mocked<IWorkflowQueryContract>;
  let mockRuleEngine: jest.Mocked<IRuleEngineContract>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockPublisher: jest.Mocked<ExecutionPublisher>;
  let mockRedis: ReturnType<typeof createMockRedisService>;

  beforeEach(() => {
    mockInstanceRepo = createMockRepository();
    mockWorkflowQuery = { getVersionSnapshot: jest.fn(), /* ... */ } as any;
    mockRuleEngine = { evaluateRules: jest.fn() } as any;
    mockDataSource = { transaction: jest.fn() } as any;
    mockPublisher = {
      publishTransitionCompleted: jest.fn(),
      publishInstanceCompleted: jest.fn(),
    } as any;
    mockRedis = createMockRedisService();

    handler = new ExecuteTransitionHandler(
      mockInstanceRepo as any,
      mockWorkflowQuery,
      mockRuleEngine,
      mockDataSource,
      mockPublisher,
      mockRedis,
    );
  });

  describe('execute()', () => {
    it('should execute transition, update state, and publish events', async () => { ... });
    it('should return cached result when idempotency key already exists', async () => { ... });
    it('should throw ConflictException when version mismatch (optimistic lock)', async () => { ... });
    it('should throw NotFoundException when instance not found', async () => { ... });
    it('should throw UnprocessableEntityException when instance is not active', async () => { ... });
    it('should throw ForbiddenException when user role is not in allowedRoleIds', async () => { ... });
    it('should throw UnprocessableEntityException when comment required but missing', async () => { ... });
    it('should throw UnprocessableEntityException when rules fail', async () => { ... });
    it('should emit COMPLETED event when transition leads to terminal state', async () => { ... });
    it('should set status to COMPLETED when destination is terminal', async () => { ... });
    it('should set status to ACTIVE when destination is not terminal', async () => { ... });
    it('should allow transition when allowedRoleIds is empty (open to all)', async () => { ... });
    it('should invalidate allowed-transitions and instance-detail caches after execution', async () => { ... });
    it('should cache result under idempotency key after successful execution', async () => { ... });
  });
});
```

### 6.7 NATS Subscriber Tests

```typescript
describe('AuditSubscriber', () => {
  let subscriber: AuditSubscriber;
  let mockAuditLogRepository: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    mockAuditLogRepository = createMockRepository();

    const module = await Test.createTestingModule({
      controllers: [AuditSubscriber],
      providers: [
        { provide: AuditLogRepository, useValue: mockAuditLogRepository },
      ],
    }).compile();

    subscriber = module.get(AuditSubscriber);
  });

  it('should persist audit log on WORKFLOW_TRANSITION_COMPLETED event', async () => {
    const payload: IWorkflowTransitionCompletedEvent = {
      eventId: TEST_IDS.EVENT_ID,
      tenantId: TEST_IDS.TENANT_A_ID,
      // ... full payload
    };
    mockAuditLogRepository.findOne.mockResolvedValue(null); // not a duplicate
    await subscriber.onTransitionCompleted(payload);
    expect(mockAuditLogRepository.save).toHaveBeenCalledTimes(1);
  });

  it('should skip duplicate events (idempotency check via eventId)', async () => {
    mockAuditLogRepository.findOne.mockResolvedValue(mockAuditLog); // duplicate
    await subscriber.onTransitionCompleted(payload);
    expect(mockAuditLogRepository.save).not.toHaveBeenCalled();
  });
});
```

### 6.8 GlobalExceptionFilter Tests

```typescript
describe('GlobalExceptionFilter', () => {
  it('should return standardised error shape for HttpException', () => { ... });
  it('should return 500 for unknown errors without stack trace', () => { ... });
  it('should return 403 for CSRF token errors (EBADCSRFTOKEN)', () => { ... });
  it('should join message array with "; " for validation errors', () => { ... });
});
```

### 6.9 Guard Tests

```typescript
describe('JwtAuthGuard', () => {
  it('should skip auth for @Public() decorated routes', () => { ... });
  it('should call super.canActivate() for non-public routes', () => { ... });
});

describe('TenantIsolationGuard', () => {
  it('should pass when tenantId is present on JWT', () => { ... });
  it('should throw UnauthorizedException when tenantId is missing', () => { ... });
  it('should attach req.tenantId from req.user.tenantId', () => { ... });
  it('should skip for @Public() routes', () => { ... });
});

describe('RolesGuard', () => {
  it('should pass when no @Roles() decorator is present', () => { ... });
  it('should pass when user has at least one required role', () => { ... });
  it('should throw ForbiddenException when user has none of required roles', () => { ... });
  it('should skip for @Public() routes', () => { ... });
});
```

---

## 7. Key Business Rules — Must Have Tests For Each

| Rule | Where to Test | Test Description |
|---|---|---|
| `tenant_id` always from JWT, never from body | `TenantIsolationGuard` + service tests | Assert tenantId param equals `actor.tenantId` |
| `allowedRoleIds: []` = open to all roles | `ExecuteTransitionHandler` | Passes when user has any role |
| `lastKnownVersion` mismatch → 409 | `ExecuteTransitionHandler` | `version !== lastKnownVersion` throws `ConflictException` |
| Idempotency key cache hit → return cached | `ExecuteTransitionHandler` | Redis returns existing, DB not called |
| Idempotency lock → 409 on concurrent duplicate | `ExecuteTransitionHandler` | `setNX` returns false → `ConflictException` |
| Audit write is in same transaction | `ExecuteTransitionHandler` | `queryRunner.manager.save(AuditLog)` inside transaction |
| Published definition is immutable | `WorkflowDefinitionService` | Modifying published throws `WORKFLOW_DEFINITION_NOT_DRAFT` |
| Draft → Published → Deprecated (no reverse) | `WorkflowDefinitionService` | State machine transitions are one-way |
| Refresh token rotation (revoke on use) | `AuthService` | Old token revoked before new token issued |
| Argon2 used for passwords (not bcrypt) | `AuthService` | `argon2hash` / `argon2verify` called |
| RLS context cleared on response AND error | `DatabaseContextInterceptor` | `clearTenantContext()` called in finally block |
| Shadow table kept in sync via NATS events | `AuthEventsSubscriber` | `onUserCreated` → `userShadowRepository.upsert()` |
| Audit logs are immutable | DB trigger (no service test needed — migration covers it) | — |
| `workflow_instances.version` incremented on transition | `ExecuteTransitionHandler` | SQL UPDATE includes `version = version + 1` |
| Definition snapshot used (not live rows) | `ExecuteTransitionHandler` | `workflowQuery.getVersionSnapshot()` called, not definition repo |

---

## 8. Module-Specific Test Requirements

### 8.1 `auth` Module

**Services to test:**
- `AuthService` — `login()`, `refresh()`, `logout()`, `issueTokenPair()`
- `UserService` — `create()`, `findAll()`, `findById()`, `deactivate()`, `assignRole()`
- `RoleService` — `create()`, `findAll()`, `findById()`
- `OnboardingService` — `registerTenant()`, `registerUser()`
- `UserQueryService` — `findById()`, `findManyByIds()`, `existsWithRole()`, `countByTenant()`
- `JwtStrategy.validate()` — cache hit, cache miss, inactive user

**Key cases for `AuthService.login()`:**
```
✅ valid credentials → returns accessToken + refreshToken
✅ user not found → UnauthorizedException (INVALID_CREDENTIALS)
✅ user inactive → UnauthorizedException (INVALID_CREDENTIALS)
✅ wrong password → UnauthorizedException (INVALID_CREDENTIALS)
✅ updates lastLoginAt timestamp
✅ includes roles and roleIds in JWT payload
```

**Key cases for `AuthService.refresh()`:**
```
✅ valid refresh token → new token pair issued, old token revoked
✅ expired refresh token → UnauthorizedException
✅ invalid hash → UnauthorizedException
✅ inactive user → UnauthorizedException
```

**Key cases for `JwtStrategy.validate()`:**
```
✅ cache hit (Redis) → returns cached payload without DB call
✅ cache miss → DB called, result cached with SHORT TTL
✅ inactive user (from cache) → UnauthorizedException
✅ missing sub or tenantId → UnauthorizedException
✅ roleIds backfilled from DB for legacy tokens missing roleIds
```

### 8.2 `tenant` Module

**Services to test:**
- `TenantService` — CRUD, feature flags, settings
- `TenantProvisioningService` — `provisionNewTenant()` (creates tenant + settings + default roles)
- `TenantQueryService` — `findById()`, `isFeatureEnabled()`, `getPlan()`

**Key cases:**
```
✅ provisionNewTenant() creates tenant + settings + 3 system roles atomically
✅ slug uniqueness violation → ConflictException (TENANT_SLUG_TAKEN)
✅ tenant inactive → UnprocessableEntityException (TENANT_INACTIVE)
✅ feature flag isFeatureEnabled() — cache hit, cache miss, missing flag (returns false)
✅ max user limit enforced before user creation
✅ max workflow limit enforced before definition creation
```

### 8.3 `workflow-definition` Module

**Services to test:**
- `WorkflowDefinitionService`
- `WorkflowStateService`
- `WorkflowTransitionService`
- `WorkflowVersionService`
- `WorkflowQueryService`

**Key cases:**
```
✅ create() — creates in DRAFT status, currentVersion = 1
✅ publish() — changes status to PUBLISHED, creates version snapshot, emits NATS event
✅ publish() on non-DRAFT → BadRequestException (WORKFLOW_DEFINITION_NOT_DRAFT)
✅ publish() with no initial state → BadRequestException (WORKFLOW_INITIAL_STATE_REQUIRED)
✅ publish() with multiple initial states → BadRequestException (WORKFLOW_MULTIPLE_INITIAL_STATES)
✅ deprecate() — changes PUBLISHED to DEPRECATED, emits NATS event
✅ deprecate() on non-PUBLISHED → BadRequestException
✅ addState() on published definition → BadRequestException (immutability)
✅ deleteState() on published definition → BadRequestException
✅ createTransition() — stores allowedRoleIds as UUID array
✅ addRule() — stores ruleDefinition as JSONB, merges schemaFields into instance form schema
✅ Cache invalidation: definition list invalidated on create/delete
✅ Version snapshot contains states + transitions + rules at publish time
```

### 8.4 `workflow-execution` Module

**Command Handlers to test:**
- `ExecuteTransitionHandler` — (see Section 6.6 for all cases)
- `CreateInstanceHandler` — creates instance in initial state, validates definition is published
- `CancelInstanceHandler` — cancels active instance, rejects completed/cancelled

**Query Handlers to test:**
- `GetAllowedTransitionsHandler` — filters by current state AND user roleIds, uses snapshot
- `GetInstanceDetailHandler` — cache hit/miss
- `GetInstanceListHandler` — pagination, status filter, definitionId filter

**Subscriber to test:**
- `AuthEventsSubscriber` — `onUserCreated`, `onUserDeactivated`, `onUserRolesUpdated`

**Key cases for `CreateInstanceHandler`:**
```
✅ creates instance at initial state from published snapshot
✅ rejects if definition not published → UnprocessableEntityException
✅ validates required payload fields against form schema
✅ sets status = 'active', version = 1
✅ emits WORKFLOW_INSTANCE_CREATED NATS event
✅ publishes audit log entry
```

**Key cases for `GetAllowedTransitionsHandler`:**
```
✅ returns only transitions from current state
✅ filters out transitions where user's roleIds not in allowedRoleIds
✅ includes transitions where allowedRoleIds = [] (open to all)
✅ returns empty array for completed/cancelled instances
✅ uses snapshot (not live definition rows)
✅ caches result with LONG TTL
✅ cache invalidated after successful transition
```

### 8.5 `rule-engine` Module

**Services to test:**
- `RuleEngineService.evaluateRules()`
- `ConditionEvaluator.evaluate()`
- `CustomRuleEvaluator.evaluate()`
- `RuleContextBuilder.build()`

**Key cases:**
```
✅ empty rules array → { passed: true, failedRules: [] }
✅ all conditions pass → { passed: true, failedRules: [] }
✅ one condition fails → { passed: false, failedRules: [{ ruleName, reason }] }
✅ 'all' operator — all must pass
✅ 'any' operator — at least one must pass
✅ payload fact path evaluation (e.g., '$.amount' > 1000)
✅ user.roles fact evaluation
✅ instance.currentState fact evaluation
✅ evaluationOrder respected (lower number evaluated first)
✅ custom rule type dispatched to CustomRuleEvaluator, not ConditionEvaluator
✅ fresh Engine instance per call (no state leakage between concurrent evaluations)
✅ json-rules-engine error propagated as RULE_EVALUATION_ERROR
```

### 8.6 `audit` Module

**Services to test:**
- `AuditService.findByInstance()` — paginated audit log query
- `AuditSubscriber` — all `@EventPattern` handlers

**Key cases for `AuditSubscriber`:**
```
✅ onTransitionCompleted → saves AuditLog with correct fields (snapshot strings, not FKs)
✅ onInstanceCreated → saves AuditLog with actionType = 'instance_created'
✅ onInstanceCompleted → saves AuditLog with actionType = 'instance_completed'
✅ onInstanceCancelled → saves AuditLog with actionType = 'instance_cancelled'
✅ duplicate eventId → skips save (idempotency check)
✅ fromState is null for instance_created action type
✅ actor email + role stored as strings (snapshot, not FK)
```

### 8.7 `notification` Module

**Services to test:**
- `NotificationService.sendEmail()`
- `WebhookService.deliver()`
- `NotificationSubscriber` — all `@EventPattern` handlers
- `NotificationTemplateBootstrapService`

**Key cases:**
```
✅ template found → email sent via mailer
✅ template not found → logs warn, no error thrown
✅ channel = 'webhook' → dispatched to WebhookService, not email
✅ webhook delivery → HTTP POST with HMAC-SHA256 signature header
✅ webhook delivery failure → logged, retry_count incremented
✅ notification log created with status 'sent' on success
✅ notification log updated to 'failed' on error
✅ cache hit for templates (Redis) — DB not queried
```

### 8.8 `dashboard` Module

```
✅ getStats() — calls all 4 contract methods in parallel (Promise.all)
✅ returns correct DashboardStatsResponseDto shape
✅ passes tenantId from JWT to each contract method
```

### 8.9 `database` Module

**`RlsContextService` to test:**
```
✅ setTenantContext(tenantId) → executes SET ROLE tenant_user; SET app.tenant_id = '...'
✅ setPublicContext() → executes SET ROLE public_user;
✅ clearTenantContext() → executes RESET ROLE; RESET app.tenant_id;
✅ withTenantContext(tenantId, fn) → sets context, calls fn, clears context in finally
✅ bypassRls(fn) → calls fn without setting tenant context
✅ getCurrentTenantContext() → returns current value of app.tenant_id
```

**`DatabaseContextInterceptor` to test:**
```
✅ creates QueryRunner, starts transaction, stores in ClsService
✅ calls setTenantContext(tenantId) for authenticated requests
✅ calls setPublicContext() for @Public() routes (no tenantId on user)
✅ commits transaction on successful response
✅ rolls back transaction on thrown error
✅ calls clearTenantContext() in finally block (always)
✅ releases QueryRunner in finally block (always)
```

---

## 9. Coverage Targets

| Layer | Minimum Coverage |
|---|---|
| Services | 90% line, 85% branch |
| Command/Query Handlers | 95% line, 90% branch |
| Controllers | 85% line, 80% branch |
| Guards & Interceptors | 90% line, 85% branch |
| Subscribers | 90% line, 85% branch |
| Filters | 95% line |
| Repositories | 80% line |
| **Overall target** | **≥ 85% all metrics** |

To verify coverage, run:
```bash
bun run test:cov
```
Or with Jest directly:
```bash
npx jest --coverage --coverageThreshold='{"global":{"lines":85,"branches":85}}'
```

---

## 10. E2E Test Generation Rules

> ⚠️ **E2E generation starts only after you say "Begin E2E Generation".**

### 10.1 E2E Test Infrastructure

E2E tests run against a **real PostgreSQL test database** with a **real NestJS application
instance**. The NestJS app boots once for the entire test suite via `test/setup.ts`,
which is registered in `jest-e2e.json` under `setupFilesAfterEnv`. Individual spec
files never boot or close the app — they read it from `global.app`.

---

#### 10.1.1 — PostgreSQL Role Prerequisites

The test database must have the exact same role structure as production.
Run this once against the test database before executing any e2e tests:

```sql
-- Application login user
CREATE USER workflow_app WITH PASSWORD 'workflow-password';

-- Roles (no login)
CREATE ROLE tenant_user;
CREATE ROLE public_user;
CREATE ROLE superadmin;

-- Connect permission
GRANT CONNECT ON DATABASE "workflow-engine-test" TO workflow_app;

-- Schema access
GRANT USAGE ON SCHEMA public TO workflow_app;
GRANT USAGE ON SCHEMA public TO tenant_user;
GRANT USAGE ON SCHEMA public TO public_user;
GRANT USAGE ON SCHEMA public TO superadmin;

-- DML grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO workflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO public_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO superadmin;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO workflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tenant_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO public_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO superadmin;

-- Future tables created by migrations
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO workflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tenant_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO public_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO superadmin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO workflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tenant_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO public_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO superadmin;

-- Grant role membership to application user
GRANT tenant_user TO workflow_app;
GRANT public_user  TO workflow_app;
GRANT superadmin   TO workflow_app;

-- BYPASSRLS only on superadmin
ALTER ROLE superadmin BYPASSRLS;
```

---

#### 10.1.2 — `.env.stage.test`

Create this file at the backend root alongside `.env.stage.dev`:

```env
NODE_ENV=test
STAGE=test
PORT=3001

DB_HOST=localhost
DB_PORT=5432
DB_USER=workflow_app
DB_PASSWORD=workflow-password
DATABASE=workflow-engine-test
DB_SSL_ENABLED=false
DB_SSL_REJECT_UNAUTHORIZED=false

REDIS_URL=redis://localhost:6379
NATS_URL=nats://localhost:4222

JWT_SECRET=test-only-secret-never-use-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRY_DAYS=7

THROTTLE_TTL=60000
THROTTLE_LIMIT=999999

SESSION_SECRET=test-session-secret
```

---

#### 10.1.3 — `test/jest-e2e.json`

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "../src",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "testTimeout": 30000,
  "setupFilesAfterEnv": ["../test/setup.ts"],
  "moduleNameMapper": {
    "^@app/shared(|/.*)$": "<rootDir>/../libs/shared/src/$1"
  }
}
```

> **Key points:**
> - `setupFilesAfterEnv` runs `test/setup.ts` before every spec file.
> - No `globalSetup` / `globalTeardown` — the app lifecycle is managed inside `setup.ts`.
> - `testTimeout: 30000` — real DB + HTTP calls need more than the default 5 s.
> - `--runInBand` is **mandatory** when running e2e: `npx jest --config test/jest-e2e.json --runInBand`

---

### 10.2 — `test/mocks.ts`

All shared e2e-level mocks live here. Individual spec files import from this file.

```typescript
// test/mocks.ts

export const mockMailerService = {
  sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
};

export const mockConfigValues: Record<string, unknown> = {
  NODE_ENV: 'test',
  STAGE: 'test',
  DB_HOST: 'localhost',
  DB_PORT: 5432,
  DB_USER: 'workflow_app',
  DB_PASSWORD: 'workflow-password',
  DATABASE: 'workflow-engine-test',
  JWT_SECRET: 'test-only-secret-never-use-in-production',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRY_DAYS: 7,
  THROTTLE_TTL: 60000,
  THROTTLE_LIMIT: 999999,
  REDIS_URL: 'redis://localhost:6379',
  NATS_URL: 'nats://localhost:4222',
};

export const mockConfigService = {
  get: jest.fn((key: string) => mockConfigValues[key]),
};
```

> Add additional service mocks here as needed (e.g. `mockHttpService`,
> `mockS3Service`). Keep one mock per external dependency. Never add business
> logic to mocks.

---

### 10.3 — `test/setup.ts` (Global App Lifecycle)

This file boots the NestJS application **once** for the entire test run and resets
the database after every individual test. It is executed via `setupFilesAfterEnv`
which means Jest runs it in the same worker process as the specs.

```typescript
// test/setup.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MailerService } from '@nestjs-modules/mailer';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { mockMailerService } from './mocks';

// ─── App lifecycle ────────────────────────────────────────────────────────────

beforeAll(async () => {
  const app = await initializeApp();
  global.app = app;
});

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  if (global.app) await global.app.close();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function initializeApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailerService)
    .useValue(mockMailerService)
    .compile();

  const app: INestApplication = moduleFixture.createNestApplication();

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalPipes(new ValidationPipe({ transform: true, stopAtFirstError: true }));
  app.useLogger(false); // suppress NestJS logs during tests

  await app.init();
  return app;
}

async function resetDatabase(): Promise<void> {
  if (!global.app) throw new Error('App not initialized — setup.ts beforeAll may have failed');

  const dataSource = global.app.get<DataSource>(DataSource);
  const entities = dataSource.entityMetadatas;

  // Clear every entity in reverse dependency order using TypeORM's repository.clear().
  // This avoids FK constraint violations without needing to list tables manually.
  // Uses SET ROLE superadmin internally so RLS does not block the truncation.
  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.clear();
  }
}
```

> **Why `repository.clear()` instead of `TRUNCATE ... CASCADE`?**
> `repository.clear()` is TypeORM-aware: it resolves the correct table name from
> the entity metadata and issues a `DELETE FROM` / `TRUNCATE` respecting the
> current connection context. It avoids the need to maintain a manual ordered
> list of table names. The `superadmin` role (BYPASSRLS) ensures the cleanup
> operation bypasses all RLS policies.

---

### 10.4 — TypeScript Global Declaration

Declare `global.app` so TypeScript does not complain in spec files:

```typescript
// test/global.d.ts
import { INestApplication } from '@nestjs/common';

declare global {
  // eslint-disable-next-line no-var
  var app: INestApplication;
}
```

---

### 10.5 — E2E Spec File Structure

Every e2e spec file follows this pattern exactly. No local `beforeAll` app
initialization — the app is already running on `global.app`.

```typescript
// test/<module>.e2e-spec.ts
import request from 'supertest';
import { DataSource } from 'typeorm';

describe('<Module> (e2e)', () => {
  // ── shared state scoped to this describe block ──────────────────────────
  let dataSource: DataSource;
  let adminToken: string;
  let tenantId: string;

  // ── seed data needed by all tests in this file ──────────────────────────
  beforeAll(async () => {
    dataSource = global.app.get<DataSource>(DataSource);

    // Register a tenant and capture the admin token + tenantId.
    // setup.ts already cleared the DB before this file started.
    const res = await request(global.app.getHttpServer())
      .post('/api/v1/auth/register/tenant')
      .send({
        tenantName: 'Acme Test Corp',
        tenantSlug: 'acme-test',
        firstName: 'Jane',
        lastName: 'Admin',
        email: 'jane.admin@acme-test.com',
        password: 'S3cur3P@ss!',
      });

    tenantId   = res.body.data.tenant.id;
    adminToken = res.body.data.accessToken;
  });

  // ── afterEach is handled globally by setup.ts ─────────────────────────
  // Do NOT add afterEach or afterAll here — setup.ts owns the DB reset
  // and app teardown. Adding a local afterAll(app.close()) will break
  // other spec files that run in the same process.

  // ── tests ─────────────────────────────────────────────────────────────
  describe('POST /api/v1/<resource>', () => {
    it('should create a resource and return 201', async () => {
      const res = await request(global.app.getHttpServer())
        .post('/api/v1/<resource>')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ /* dto */ });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.tenantId).toBe(tenantId);
    });

    it('should return 401 without a Bearer token', async () => {
      const res = await request(global.app.getHttpServer())
        .post('/api/v1/<resource>')
        .send({ /* dto */ });

      expect(res.status).toBe(401);
    });
  });
});
```

> **Rules for every spec file:**
> - Access the app via `global.app` only — never boot a new app.
> - Store seeded IDs in `beforeAll` — do not re-seed inside individual `it()` blocks.
> - Never call `global.app.close()` — `setup.ts` owns teardown.
> - Never add a local `afterEach(resetDatabase)` — `setup.ts` already does this.
> - Run with `--runInBand` — parallel execution corrupts shared DB state.

---

### 10.6 — E2E Scope Per Module and Golden Path

Generate one e2e spec file per module. Each e2e spec covers:

```
✅ Full happy-path API flow (create → read → update → delete)
✅ Multi-tenant isolation — Tenant A cannot see Tenant B's data
✅ Role-based access — Requestor cannot call Admin-only endpoints
✅ Invalid inputs return correct HTTP status + errorCode shape
✅ RLS enforcement — verify tenant_id filter applied at DB level
✅ Pagination — verify page/limit behaviour
✅ End-to-end workflow execution flow (integration test across all modules)
```

---

**The Golden E2E Path — Leave Management System**

This single flow exercises every module in sequence. Use **Leave Management** as the
domain throughout. States: `Applied` → `Under Review` → `Approved`.
Execute the steps in this exact order with no deviations.

All variables captured from responses (IDs, tokens, version numbers) must be stored
and reused in subsequent steps — never hardcode UUIDs.

---

#### Step 1 — Create Tenant + First Admin User

```
POST /api/v1/auth/register/tenant
```

```json
{
  "tenantName": "Acme Leave Corp",
  "tenantSlug": "acme-leave",
  "firstName": "Jane",
  "lastName": "Admin",
  "email": "jane.admin@acme-leave.com",
  "password": "S3cur3P@ss!"
}
```

**Store from response:**
```
adminAccessToken   = response.body.data.accessToken
adminRefreshToken  = response.body.data.refreshToken
tenantId           = response.body.data.tenant.id
tenantSlug         = response.body.data.tenant.slug   // "acme-leave"
adminUserId        = response.body.data.user.id
```

**Assert:**
- HTTP `201`
- `response.body.status === 'success'`
- `tenantId` is a valid UUID
- `adminAccessToken` is a non-empty string

---

#### Step 2 — Self-Register a Requestor User

```
POST /api/v1/auth/register
```

```json
{
  "firstName": "Bob",
  "lastName": "Requestor",
  "email": "bob.requestor@acme-leave.com",
  "password": "S3cur3P@ss!",
  "tenantSlug": "acme-leave"
}
```

> Self-registration uses `tenantSlug`, **not** `tenantId`.

**Store from response:**
```
requestorAccessToken  = response.body.data.accessToken
requestorUserId       = response.body.data.user.id
```

**Assert:**
- HTTP `201`
- `response.body.data.tenant.slug === 'acme-leave'`
- Requestor is scoped to the same tenant

---

#### Step 3 — Login as Tenant Admin

```
POST /api/v1/auth/login
```

```json
{
  "email": "jane.admin@acme-leave.com",
  "password": "S3cur3P@ss!",
  "tenantId": "<tenantId from Step 1>"
}
```

> Login requires `tenantId` (UUID), **not** `tenantSlug`.

**Store from response:**
```
adminAccessToken  = response.body.data.accessToken
adminRefreshToken = response.body.data.refreshToken
```

**Assert:**
- HTTP `200`
- `response.body.data.accessToken` is a non-empty string

---

#### Step 4 — Get Current Logged-In User

```
GET /api/v1/auth/me
Authorization: Bearer <adminAccessToken>
```

**Assert:**
- HTTP `200`
- `response.body.data.id === adminUserId`
- `response.body.data.email === 'jane.admin@acme-leave.com'`
- `response.body.data.roles` contains `'Admin'`
- `response.body.data.tenantId === tenantId`

---

#### Step 5 — Create an Approver User (Admin Creates)

```
POST /api/v1/users
Authorization: Bearer <adminAccessToken>
```

```json
{
  "firstName": "Alice",
  "lastName": "Approver",
  "email": "alice.approver@acme-leave.com",
  "password": "S3cur3P@ss!"
}
```

> `tenantId` is NOT sent in the body — it is extracted from the admin's JWT by the server.

**Store from response:**
```
approverUserId = response.body.data.id
```

**Assert:**
- HTTP `201`
- `response.body.data.tenantId === tenantId`
- `response.body.data.isActive === true`

---

#### Step 6 — Get All Users

```
GET /api/v1/users?page=1&limit=20
Authorization: Bearer <adminAccessToken>
```

**Assert:**
- HTTP `200`
- `response.body.count >= 3` (admin + requestor + approver)
- All returned users have `tenantId === tenantId`
- No users from other tenants appear

---

#### Step 7 — Create a Manager Role

```
POST /api/v1/roles
Authorization: Bearer <adminAccessToken>
```

```json
{
  "name": "Manager",
  "description": "Can review and approve leave requests"
}
```

**Store from response:**
```
managerRoleId = response.body.data.id
```

**Assert:**
- HTTP `201`
- `response.body.data.name === 'Manager'`
- `response.body.data.isSystemRole === false`
- `response.body.data.tenantId === tenantId`

---

#### Step 7b — Assign Manager Role to Approver User

```
POST /api/v1/users/<approverUserId>/roles
Authorization: Bearer <adminAccessToken>
```

```json
{
  "roleId": "<managerRoleId>"
}
```

**Assert:**
- HTTP `201`

> Required before Step 20b. The Approve Leave transition restricts
> `allowedRoleIds` to `[managerRoleId]` — without this the approver cannot execute it.

---

#### Step 8 — Get All Roles

```
GET /api/v1/roles
Authorization: Bearer <adminAccessToken>
```

**Assert:**
- HTTP `200`
- Response contains system roles (`Admin`, `Approver`, `Requestor`) plus `Manager`
- `managerRoleId` is present in the list

---

#### Step 9 — Get Workflow Rule Metadata

```
GET /api/v1/workflow-rules/metadata
Authorization: Bearer <adminAccessToken>
```

**Assert:**
- HTTP `200`
- Response contains `operators` array (includes `greaterThan`, `lessThan`, `equal`, etc.)
- Response contains fact namespaces (includes `payload`, `user`, `instance`)
- Response contains example rule definition shapes

---

#### Step 10 — Create Workflow Definition

```
POST /api/v1/workflow-definitions
Authorization: Bearer <adminAccessToken>
```

```json
{
  "name": "Leave Approval Workflow",
  "description": "Manages employee leave requests from application to approval."
}
```

**Store from response:**
```
workflowDefinitionId = response.body.data.id
```

**Assert:**
- HTTP `201`
- `response.body.data.status === 'draft'`
- `response.body.data.currentVersion === 1`
- `response.body.data.tenantId === tenantId`

---

#### Step 11 — Create Three Workflow States

Call `POST /api/v1/workflow-definitions/<workflowDefinitionId>/states` three times.

**State 1 — Applied (initial)**
```json
{
  "name": "Applied",
  "description": "Leave request submitted by employee",
  "isInitial": true,
  "isTerminal": false,
  "positionX": 100,
  "positionY": 200,
  "metadata": { "color": "#3B82F6", "icon": "file-text" }
}
```
**Store:** `appliedStateId = response.body.data.id`

**State 2 — Under Review (intermediate)**
```json
{
  "name": "Under Review",
  "description": "Leave request is being reviewed by manager",
  "isInitial": false,
  "isTerminal": false,
  "positionX": 400,
  "positionY": 200,
  "metadata": { "color": "#F59E0B", "icon": "search" }
}
```
**Store:** `underReviewStateId = response.body.data.id`

**State 3 — Approved (terminal)**
```json
{
  "name": "Approved",
  "description": "Leave request approved",
  "isInitial": false,
  "isTerminal": true,
  "positionX": 700,
  "positionY": 200,
  "metadata": { "color": "#10B981", "icon": "check-circle" }
}
```
**Store:** `approvedStateId = response.body.data.id`

**Assert for each state:**
- HTTP `201`
- `response.body.data.workflowDefinitionId === workflowDefinitionId`
- `response.body.data.tenantId === tenantId`

---

#### Step 12 — Create Two Transitions

Call `POST /api/v1/workflow-definitions/<workflowDefinitionId>/transitions` twice.

**Transition 1 — Submit for Review (open to all roles)**
```json
{
  "name": "Submit for Review",
  "fromStateId": "<appliedStateId>",
  "toStateId": "<underReviewStateId>",
  "allowedRoleIds": [],
  "requiresComment": false
}
```
**Store:** `submitTransitionId = response.body.data.id`

> `allowedRoleIds: []` means the transition is open to any authenticated user.

**Transition 2 — Approve Leave (restricted to Manager)**
```json
{
  "name": "Approve Leave",
  "fromStateId": "<underReviewStateId>",
  "toStateId": "<approvedStateId>",
  "allowedRoleIds": ["<managerRoleId>"],
  "requiresComment": true
}
```
**Store:** `approveTransitionId = response.body.data.id`

**Assert for each:**
- HTTP `201`
- `response.body.data.workflowDefinitionId === workflowDefinitionId`

---

#### Step 13 — Assign Rules to Transitions

Attach a rule to **Approve Leave** so it only executes when `payload.days > 7`.

```
POST /api/v1/workflow-definitions/<workflowDefinitionId>/transitions/<approveTransitionId>/rules
Authorization: Bearer <adminAccessToken>
```

```json
{
  "ruleName": "leave-days-greater-than-7",
  "ruleDefinition": {
    "all": [
      {
        "fact": "payload",
        "path": "$.days",
        "operator": "greaterThan",
        "value": 7
      }
    ]
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
```

**Store:** `ruleId = response.body.data.id`

**Assert:**
- HTTP `201`
- `response.body.data.transitionId === approveTransitionId`
- `response.body.data.ruleName === 'leave-days-greater-than-7'`
- `response.body.data.ruleDefinition.all[0].operator === 'greaterThan'`

---

#### Step 14 — Get Instance Form Schema

```
GET /api/v1/workflow-definitions/<workflowDefinitionId>/instance-form-schema
Authorization: Bearer <adminAccessToken>
```

**Assert:**
- HTTP `200`
- `response.body.data.schema.fields` contains an entry with `key === 'days'`
- `response.body.data.schema.fields[x].type === 'number'`
- `response.body.data.schema.fields[x].required === true`

---

#### Step 15 — Publish the Workflow

```
POST /api/v1/workflow-definitions/<workflowDefinitionId>/publish
Authorization: Bearer <adminAccessToken>
```

No request body.

**Assert:**
- HTTP `201`
- `response.body.data.versionNumber === 1`
- `response.body.data.isActive === true`
- `response.body.data.snapshot.states.length === 3`
- `response.body.data.snapshot.transitions.length === 2`
- Snapshot transition for Approve Leave contains the rule
- `response.body.data.publishedBy === adminUserId`

---

#### Step 16 — List All Workflow Definitions

```
GET /api/v1/workflow-definitions?page=1&limit=20
Authorization: Bearer <adminAccessToken>
```

**Assert:**
- HTTP `200`
- `response.body.count >= 1`
- The published definition appears with `status === 'published'`
- All returned definitions have `tenantId === tenantId`

---

#### Step 17 — Get One Workflow Definition

```
GET /api/v1/workflow-definitions/<workflowDefinitionId>
Authorization: Bearer <adminAccessToken>
```

**Assert:**
- HTTP `200`
- `response.body.data.id === workflowDefinitionId`
- `response.body.data.status === 'published'`
- `response.body.data.currentVersion === 1`

---

#### Step 18 — Create a Workflow Instance

```
POST /api/v1/workflow-instances
Authorization: Bearer <requestorAccessToken>
```

```json
{
  "workflowDefinitionId": "<workflowDefinitionId>",
  "payload": {
    "employeeName": "Bob Requestor",
    "leaveType": "annual",
    "startDate": "2026-04-01",
    "endDate": "2026-04-10",
    "days": 10,
    "reason": "Family vacation"
  }
}
```

> `days: 10` satisfies the rule `days > 7` on the Approve Leave transition.

**Store from response:**
```
instanceId       = response.body.data.id
instanceVersion  = response.body.data.version     // must be 1
```

**Assert:**
- HTTP `201`
- `response.body.data.currentStateName === 'Applied'`
- `response.body.data.status === 'active'`
- `response.body.data.version === 1`
- `response.body.data.definitionVersion === 1`
- `response.body.data.tenantId === tenantId`
- `response.body.data.createdBy === requestorUserId`

---

#### Step 19 — Get Allowed Transitions

```
GET /api/v1/workflow-instances/<instanceId>/allowed-transitions
Authorization: Bearer <requestorAccessToken>
```

> ⚠️ This endpoint returns a **raw array**, not the standard `{ status, data }` wrapper.

**Assert:**
- HTTP `200`
- `Array.isArray(response.body) === true`
- Array contains exactly one entry: the `Submit for Review` transition
- `response.body[0].name === 'Submit for Review'`
- `response.body[0].id === submitTransitionId`
- `response.body[0].requiresComment === false`
- `response.body[0].allowedRoleIds` is an empty array
- The `Approve Leave` transition does **not** appear (instance is in `Applied` state)

---

#### Step 20 — Execute Transition: Applied → Under Review

```
POST /api/v1/workflow-instances/<instanceId>/transitions
Authorization: Bearer <requestorAccessToken>
```

```json
{
  "transitionId": "<submitTransitionId>",
  "lastKnownVersion": 1,
  "comment": "Submitting my leave request for review.",
  "idempotencyKey": "leave-submit-<instanceId>-v1"
}
```

> The field is `lastKnownVersion`, **not** `expectedVersion`.

**Assert:**
- HTTP `201`
- `response.body.data.currentStateName === 'Under Review'`
- `response.body.data.version === 2`
- `response.body.data.status === 'active'`

**Update stored variable:** `instanceVersion = 2`

---

#### Step 20b — Login as Approver, then Execute Transition: Under Review → Approved

```
POST /api/v1/auth/login
```
```json
{
  "email": "alice.approver@acme-leave.com",
  "password": "S3cur3P@ss!",
  "tenantId": "<tenantId>"
}
```
**Store:** `approverAccessToken = response.body.data.accessToken`

```
POST /api/v1/workflow-instances/<instanceId>/transitions
Authorization: Bearer <approverAccessToken>
```

```json
{
  "transitionId": "<approveTransitionId>",
  "lastKnownVersion": 2,
  "comment": "10 days approved. HR policy satisfied.",
  "idempotencyKey": "leave-approve-<instanceId>-v2"
}
```

> `requiresComment: true` — comment must not be empty.
> Rule `days > 7` evaluates against `payload.days = 10` — passes.

**Assert:**
- HTTP `201`
- `response.body.data.currentStateName === 'Approved'`
- `response.body.data.version === 3`
- `response.body.data.status === 'completed'`
- `response.body.data.completedAt` is a non-null ISO timestamp

**Update stored variable:** `instanceVersion = 3`

---

#### Step 21 — Get Instance Detail (Verify State Change + Version Increment)

```
GET /api/v1/workflow-instances/<instanceId>
Authorization: Bearer <adminAccessToken>
```

**Assert:**
- HTTP `200`
- `response.body.data.currentStateName === 'Approved'`
- `response.body.data.status === 'completed'`
- `response.body.data.version === 3`
- `response.body.data.completedAt` is not null

> Version must be exactly `3`: creation (v1) → Submit for Review (v2) → Approve Leave (v3).

---

#### Step 22 — Get Audit Logs and Verify Immutable Audit Trail

```
GET /api/v1/workflow-instances/<instanceId>/audit-logs?page=1&limit=20
Authorization: Bearer <adminAccessToken>
```

**Assert:**
- HTTP `200`
- `response.body.count >= 3`

**Audit log entries to verify (chronological order):**

| # | `actionType` | `fromState` | `toState` | `actorEmail` |
|---|---|---|---|---|
| 1 | `instance_created` | `null` | `Applied` | `bob.requestor@acme-leave.com` |
| 2 | `transition_executed` | `Applied` | `Under Review` | `bob.requestor@acme-leave.com` |
| 3 | `transition_executed` | `Under Review` | `Approved` | `alice.approver@acme-leave.com` |

**For each entry assert:**
- `tenantId === tenantId`
- `instanceId === instanceId`
- `actorEmail` is a plain string snapshot (not a foreign key reference)
- `actorRole` is a plain string snapshot
- `eventId` is a unique UUID per entry
- No `updatedAt` field present on any audit log row (append-only, immutable)

**Immutability assertion — attempt a direct DB UPDATE (must throw):**

```typescript
const dataSource = global.app.get<DataSource>(DataSource);

await expect(
  dataSource.query(
    `UPDATE audit_logs SET comment = 'tampered' WHERE id = $1`,
    [firstAuditLogId]
  )
).rejects.toThrow();
// The PostgreSQL BEFORE UPDATE OR DELETE trigger on audit_logs raises an exception.
```

---

#### Cross-Cutting Assertions (append to the golden-path spec)

**Tenant isolation:**
```typescript
const tenant2Res = await request(global.app.getHttpServer())
  .post('/api/v1/auth/register/tenant')
  .send({ tenantName: 'Rival Corp', tenantSlug: 'rival-corp', /* ... */ });
const tenant2Token = tenant2Res.body.data.accessToken;

const res = await request(global.app.getHttpServer())
  .get(`/api/v1/workflow-definitions/${workflowDefinitionId}`)
  .set('Authorization', `Bearer ${tenant2Token}`);

expect(res.status).toBe(404); // RLS filters it out completely
```

**Optimistic lock conflict:**
```typescript
const staleRes = await request(global.app.getHttpServer())
  .post(`/api/v1/workflow-instances/${newInstanceId}/transitions`)
  .set('Authorization', `Bearer ${requestorAccessToken}`)
  .send({ transitionId: submitTransitionId, lastKnownVersion: 999 });

expect(staleRes.status).toBe(409);
expect(staleRes.body.errorCode).toBe('TRANSITION_CONFLICT');
```

**Rule failure (`days: 5` does not satisfy `days > 7`):**
```typescript
// Create instance with days: 5, advance to Under Review, then attempt Approve Leave
const ruleFailRes = await request(global.app.getHttpServer())
  .post(`/api/v1/workflow-instances/${shortLeaveInstanceId}/transitions`)
  .set('Authorization', `Bearer ${approverAccessToken}`)
  .send({ transitionId: approveTransitionId, lastKnownVersion: 2, comment: 'Trying' });

expect(ruleFailRes.status).toBe(422);
expect(ruleFailRes.body.errorCode).toBe('TRANSITION_RULES_FAILED');
expect(ruleFailRes.body.failedRules).toContainEqual(
  expect.objectContaining({ ruleName: 'leave-days-greater-than-7' })
);
```

**Missing comment on `requiresComment` transition:**
```typescript
const noCommentRes = await request(global.app.getHttpServer())
  .post(`/api/v1/workflow-instances/${instanceId}/transitions`)
  .set('Authorization', `Bearer ${approverAccessToken}`)
  .send({ transitionId: approveTransitionId, lastKnownVersion: 2 }); // no comment

expect(noCommentRes.status).toBe(422);
expect(noCommentRes.body.errorCode).toBe('COMMENT_REQUIRED');
```

---

## 11. What NOT to Do

```
❌ Do not import services from other modules directly (use contract tokens only)
❌ Do not use real database in unit tests
❌ Do not use real Redis in unit tests
❌ Do not use real NATS in unit tests
❌ Do not modify existing source files
❌ Do not add or change business logic to make tests pass — fix the test, not the code
❌ Do not use `any` type in test files
❌ Do not generate new random UUIDs in each spec — always import from TEST_IDS
❌ Do not skip afterEach(() => jest.clearAllMocks()) — always clear mocks between tests
❌ Do not use setTimeout or real delays — mock time-dependent code
❌ Do not test private methods directly — test through public API
```

---

## 12. Workflow for Each Module Session

When the human provides a module name, follow this exact sequence:

```
STEP 1: Announce which files you will create (list them all)
STEP 2: Create the mock entity objects for this module in the shared test-utils
         (if not already created for this module)
STEP 3: Generate service spec files (one per service)
STEP 4: Generate controller spec files (one per controller)
STEP 5: Generate handler spec files (if CQRS module)
STEP 6: Generate subscriber spec files (if NATS subscriber exists)
STEP 7: Generate repository spec files (complex methods only)
STEP 8: Output Jest coverage command specific to this module:
         npx jest --testPathPattern="src/modules/<module>" --coverage
STEP 9: STOP. State: "Module <name> unit tests complete. Awaiting approval."
```

Do not proceed to any other module or to e2e tests until explicitly instructed.

---

## 13. Test File Header Template

Every generated test file must begin with:

```typescript
/**
 * Unit Tests: <ClassName>
 * Module: <module-name>
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - ClsService (nest-cls): queryRunner propagation
 * - RlsContextService: tenant context (SET ROLE tenant_user / public_user)
 * - RedisService: caching and idempotency
 * - [other mocks as applicable]
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
```

---

## 14. Quick Reference — Import Paths

```typescript
// Shared test utils (after you create them)
import { TEST_IDS } from '@app/shared/test-utils/mocks/uuid.constants';
import { mockAdminJwt, mockApproverJwt, mockRequestorJwt } from '@app/shared/test-utils/mocks/jwt-payload.mock';
import { createMockRedisService } from '@app/shared/test-utils/mocks/redis.mock';
import { createMockClsService } from '@app/shared/test-utils/mocks/cls.mock';
import { createMockRlsContextService } from '@app/shared/test-utils/mocks/rls-context.mock';
import { createMockQueryRunner, createMockEntityManager } from '@app/shared/test-utils/mocks/query-runner.mock';
import { createMockRepository } from '@app/shared/test-utils/mocks/repository.mock';
import { createMockNatsClient } from '@app/shared/test-utils/mocks/nats-client.mock';

// App errors (for asserting thrown exceptions)
import { AppErrors } from '@app/shared/constants/app-errors.enum';

// NestJS exceptions
import {
  NotFoundException, ConflictException, UnprocessableEntityException,
  ForbiddenException, BadRequestException, UnauthorizedException,
} from '@nestjs/common';

// NestJS testing
import { Test, TestingModule } from '@nestjs/testing';

// Cache constants (for asserting correct Redis keys)
import { CacheKeys } from '../../../infra/cache-keys';
import { CacheTTL } from '../../../infra/cache-ttl';
```

---

*End of Prompt — Await module name to begin generation.*
