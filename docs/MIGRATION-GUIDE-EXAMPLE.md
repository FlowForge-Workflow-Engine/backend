# Migration Guide Example

This document provides an example migration flow for:

1. gRPC connection between `workflow-execution` and `rule-engine`
2. Extracting the `workflow-execution` module into an independent microservice

For each step:
- **Step**: what to do
- **What it does**: expected impact
- **Code snippet**: what to write/remove

---

## 1) gRPC Connection: `workflow-execution` -> `rule-engine`

### Step 1: Define the gRPC contract (`.proto`)
**What it does**  
Creates a stable API contract so `workflow-execution` calls `rule-engine` through gRPC instead of direct in-process dependency.

**Code snippet (write)**  
Create: `proto/rule-engine.proto`

```proto
syntax = "proto3";

package ruleengine;

service RuleEngineService {
  rpc EvaluateRule(EvaluateRuleRequest) returns (EvaluateRuleResponse);
}

message EvaluateRuleRequest {
  string tenantId = 1;
  string workflowId = 2;
  string transitionId = 3;
  string actorId = 4;
  string payloadJson = 5;
}

message EvaluateRuleResponse {
  bool allowed = 1;
  string reason = 2;
}
```

---

### Step 2: Add gRPC server bootstrap in `rule-engine` app
**What it does**  
Starts a gRPC server that exposes `EvaluateRule` to other services.

**Code snippet (write)**  
In `rule-engine` service `main.ts`:

```ts
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { join } from "path";

app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.GRPC,
  options: {
    package: "ruleengine",
    protoPath: join(process.cwd(), "proto/rule-engine.proto"),
    url: process.env.RULE_ENGINE_GRPC_URL || "0.0.0.0:50051",
  },
});

await app.startAllMicroservices();
```

---

### Step 3: Implement gRPC controller in `rule-engine`
**What it does**  
Maps gRPC method calls to existing `RuleEngineService` logic.

**Code snippet (write)**  
Create: `src/modules/rule-engine/controllers/rule-engine.grpc.controller.ts`

```ts
import { Controller, Inject } from "@nestjs/common";
import { GrpcMethod } from "@nestjs/microservices";
import { RULE_ENGINE_CONTRACT } from "@app/shared/interfaces/contracts/rule-engine.contract";

@Controller()
export class RuleEngineGrpcController {
  constructor(
    @Inject(RULE_ENGINE_CONTRACT)
    private readonly ruleEngine: any
  ) {}

  @GrpcMethod("RuleEngineService", "EvaluateRule")
  async evaluateRule(payload: {
    tenantId: string;
    workflowId: string;
    transitionId: string;
    actorId: string;
    payloadJson: string;
  }) {
    const result = await this.ruleEngine.evaluateTransition({
      tenantId: payload.tenantId,
      workflowId: payload.workflowId,
      transitionId: payload.transitionId,
      actorId: payload.actorId,
      payload: JSON.parse(payload.payloadJson || "{}"),
    });

    return {
      allowed: Boolean(result?.allowed),
      reason: result?.reason || "",
    };
  }
}
```

Also register controller in `RuleEngineModule`.

---

### Step 4: Register gRPC client in `workflow-execution`
**What it does**  
Configures `workflow-execution` as a gRPC client of `rule-engine`.

**Code snippet (write)**  
Update `src/modules/workflow-execution/workflow-execution.module.ts`:

```ts
import { ClientsModule, Transport } from "@nestjs/microservices";
import { join } from "path";

@Module({
  imports: [
    ClientsModule.register([
      {
        name: "RULE_ENGINE_GRPC",
        transport: Transport.GRPC,
        options: {
          package: "ruleengine",
          protoPath: join(process.cwd(), "proto/rule-engine.proto"),
          url: process.env.RULE_ENGINE_GRPC_URL || "localhost:50051",
        },
      },
    ]),
    // ...
  ],
})
export class WorkflowExecutionModule {}
```

---

### Step 5: Add adapter service to call gRPC instead of direct module injection
**What it does**  
Introduces a boundary layer so handlers/services in `workflow-execution` stay clean and transport-agnostic.

**Code snippet (write)**  
Create: `src/modules/workflow-execution/services/rule-engine-grpc.client.ts`

```ts
import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { ClientGrpc } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";

type RuleEngineGrpc = {
  evaluateRule(data: {
    tenantId: string;
    workflowId: string;
    transitionId: string;
    actorId: string;
    payloadJson: string;
  }): any;
};

@Injectable()
export class RuleEngineGrpcClient implements OnModuleInit {
  private svc!: RuleEngineGrpc;

  constructor(@Inject("RULE_ENGINE_GRPC") private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<RuleEngineGrpc>("RuleEngineService");
  }

  async evaluateTransition(input: {
    tenantId: string;
    workflowId: string;
    transitionId: string;
    actorId: string;
    payload: Record<string, unknown>;
  }) {
    const response = await firstValueFrom(
      this.svc.evaluateRule({
        ...input,
        payloadJson: JSON.stringify(input.payload ?? {}),
      })
    );
    return response;
  }
}
```

---

### Step 6: Remove direct in-process module dependency
**What it does**  
Eliminates tight coupling (`WorkflowExecutionModule -> RuleEngineModule`) so extraction is possible.

**Code snippet (remove / replace)**  
In `src/modules/workflow-execution/workflow-execution.module.ts`:

```ts
// REMOVE
import { RuleEngineModule } from "../rule-engine/rule-engine.module";

@Module({
  imports: [
    // REMOVE
    RuleEngineModule,
  ],
})
```

Replace injection in execution services/handlers:

```ts
// BEFORE
constructor(@Inject(RULE_ENGINE_CONTRACT) private readonly ruleEngine: any) {}

// AFTER
constructor(private readonly ruleEngine: RuleEngineGrpcClient) {}
```

---

### Step 7: Add resiliency (timeout/retry/circuit-breaker)
**What it does**  
Prevents rule-engine failures from taking down workflow execution paths.

**Code snippet (write)**  
Inside `RuleEngineGrpcClient.evaluateTransition(...)`:

```ts
import { timeout, retry } from "rxjs/operators";

const response = await firstValueFrom(
  this.svc
    .evaluateRule({
      ...input,
      payloadJson: JSON.stringify(input.payload ?? {}),
    })
    .pipe(timeout(1200), retry({ count: 2 }))
);
```

---

### Step 8: Validate via integration test
**What it does**  
Confirms cross-service behavior before proceeding with full extraction.

**Code snippet (write)**  
Example test assertion:

```ts
it("rejects transition when rule-engine says not allowed", async () => {
  jest.spyOn(ruleEngineGrpcClient, "evaluateTransition").mockResolvedValue({
    allowed: false,
    reason: "Insufficient role",
  });

  await expect(service.executeTransition(cmd)).rejects.toThrow("Insufficient role");
});
```

---

## 2) Extracting `workflow-execution` as a Microservice

### Step 1: Create separate service boundary
**What it does**  
Moves `workflow-execution` from in-app module to its own deployable service (`apps/workflow-execution-service` or separate repo).

**Code snippet (write)**  
New `workflow-execution` app module:

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(workflowExecutionOrmConfig),
    WorkflowExecutionModule,
  ],
})
export class WorkflowExecutionServiceAppModule {}
```

---

### Step 2: Add service bootstrap + transport(s)
**What it does**  
Runs `workflow-execution` as an independent process with HTTP and/or message bus transport.

**Code snippet (write)**  
`apps/workflow-execution-service/src/main.ts`:

```ts
const app = await NestFactory.create(WorkflowExecutionServiceAppModule);
app.setGlobalPrefix("/api");
await app.listen(process.env.PORT || 3100, "0.0.0.0");
```

Optional NATS ingress:

```ts
app.connectMicroservice({
  transport: Transport.NATS,
  options: { servers: [process.env.NATS_URL || "nats://localhost:4222"] },
});
await app.startAllMicroservices();
```

---

### Step 3: Remove `WorkflowExecutionModule` from monolith root
**What it does**  
Prevents duplicate ownership and ensures monolith no longer serves execution endpoints.

**Code snippet (remove)**  
In monolith `src/app.module.ts`:

```ts
// REMOVE
import { WorkflowExecutionModule } from "./modules/workflow-execution/workflow-execution.module";

@Module({
  imports: [
    // REMOVE
    WorkflowExecutionModule,
  ],
})
```

---

### Step 4: Move shared contracts and DTOs to shared library
**What it does**  
Allows monolith and extracted service to compile against common interfaces without code duplication.

**Code snippet (write/remove)**  
Move to `libs/shared` and replace imports:

```ts
// BEFORE (local import)
import { ExecuteTransitionDto } from "../dto/execute-transition.dto";

// AFTER (shared import)
import { ExecuteTransitionDto } from "@app/shared/contracts/workflow-execution/execute-transition.dto";
```

---

### Step 5: Externalize data access ownership
**What it does**  
Defines DB ownership for `workflow_execution` tables and blocks unsafe cross-service direct writes.

**Code snippet (write/remove)**  
In non-owner services, remove direct repository usage:

```ts
// REMOVE direct repository usage outside workflow-execution service
@InjectRepository(WorkflowInstance)
private readonly repo: Repository<WorkflowInstance>;
```

Replace with API/gRPC client call:

```ts
const instance = await workflowExecutionClient.getInstance({ id: instanceId, tenantId });
```

---

### Step 6: Introduce anti-corruption adapters in caller services
**What it does**  
Keeps existing domain logic stable while swapping local calls with remote calls.

**Code snippet (write)**  
Create adapter interface:

```ts
export interface WorkflowExecutionPort {
  executeTransition(input: ExecuteTransitionInput): Promise<ExecuteTransitionResult>;
}
```

Remote implementation:

```ts
@Injectable()
export class WorkflowExecutionHttpAdapter implements WorkflowExecutionPort {
  async executeTransition(input: ExecuteTransitionInput) {
    return this.http.post("/workflow-execution/transitions/execute", input);
  }
}
```

---

### Step 7: Add distributed concerns (idempotency, tracing, auth propagation)
**What it does**  
Prevents duplicate execution, preserves request identity, and maintains tenant/user context across services.

**Code snippet (write)**  
Pass correlation + tenant headers in outgoing requests:

```ts
await this.http.post(
  "/workflow-execution/transitions/execute",
  body,
  {
    headers: {
      "x-request-id": requestId,
      "x-tenant-id": tenantId,
      authorization: bearerToken,
    },
  }
);
```

---

### Step 8: Cutover with feature flag and rollback path
**What it does**  
Enables gradual rollout: route some traffic to extracted service, then full cutover when stable.

**Code snippet (write)**  
Routing strategy:

```ts
if (this.flags.isEnabled("workflowExecutionRemote")) {
  return this.workflowExecutionRemote.executeTransition(input);
}
return this.workflowExecutionLocal.executeTransition(input);
```

---

### Step 9: Validate and decommission local path
**What it does**  
After stable metrics, removes dead monolith execution path and finalizes extraction.

**Code snippet (remove)**  

```ts
// REMOVE after full cutover
return this.workflowExecutionLocal.executeTransition(input);
```

---

## Rollout Checklist (Recommended)

- Contract-first versioning for gRPC (`rule-engine.proto`)
- Timeouts/retries and failure mapping in clients
- Integration tests for cross-service transitions
- Observability: logs, traces, metrics per hop
- Feature flags for gradual migration and rollback
- Runbook updates (on-call, incident playbook, operational dashboards)

