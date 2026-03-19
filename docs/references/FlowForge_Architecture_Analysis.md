# FlowForge Workflow Engine — Architecture Analysis

---

## Scale Targets Referenced Throughout

| Label      | Concurrent Users | Tenants | Total Users | Workflow Instances |
| ---------- | ---------------- | ------- | ----------- | ------------------ |
| **Scale1** | 10K              | 1K      | 1M+         | 10M+               |
| **Scale2** | 100K             | 10K     | 10M+        | 100M+              |

---

## Q1 — Why Does Rule Engine Need to Be a Separate Service?

### The Honest Answer First

At **Scale1, it should NOT be a separate service.** The diagram is showing the full-scale target. Extracting it prematurely is a trap.

At **Scale2, it earns its own process boundary** for specific, measurable reasons.

---

### Why the Separation Exists (Full-Scale Justification)

#### 1. Resource Profile Mismatch

`json-rules-engine` evaluating deeply nested JSON AST trees is **CPU-bound**. Workflow Execution Service is primarily **I/O-bound** (PostgreSQL reads/writes, NATS publishes, Redis lookups). When you co-locate them in the same pod:

- CPU spikes from a heavy tenant's complex rule trees starve the I/O event loop.
- You cannot scale CPU capacity independently from I/O capacity.
- One oversized pod does two jobs instead of two right-sized pods doing one job each.

#### 2. Tenant Rule Complexity is Unpredictable

In a multi-tenant SaaS, Tenant A may have simple `amount > 1000` rules, while Tenant B (an enterprise healthcare tenant) has a 50-condition rule tree with nested AND/OR, external fact fetches, and regex evaluations. At Scale2, noisy tenant rule evaluation becomes a hard isolation problem. A separate service allows:

- Per-tenant rate limiting at the rule evaluation layer.
- Dedicated Rule Engine pods for enterprise tenants (bulkhead pattern).

#### 3. Independent Versioning and Deployment

The rule DSL (`json-rules-engine` schema, custom operators, evaluator logic) evolves separately from state machine execution logic. Separating them allows:

- Deploying a new rule evaluator version without touching Execution Service.
- A/B testing new rule evaluation logic against a subset of traffic.
- Rolling back Rule Engine independently if a new operator causes bugs.

#### 4. Reuse Surface (Future)

Once extracted, the Rule Engine Service is not tied to Workflow Execution. Future callers:

- Webhook Trigger Service (evaluate should-fire conditions before sending)
- API Gateway plugin (evaluate tenant feature flags)
- Scheduled Jobs Service (evaluate should-run conditions)

#### 5. Stateless Compute = Cheap to Scale

Rule evaluation is pure function: `(ruleAST, context) → boolean`. No database writes, no state. This makes it the easiest service to horizontally scale. At Scale2 with 100K concurrent users, you may have 2 Execution Service pods and 10 Rule Engine pods — impossible if co-located.

---

### Recommendation by Scale

| Scale        | Rule Engine Location                     | Reason                                                               |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------- |
| MVP / Scale1 | **Library inside Execution Service**     | No operational overhead, no network hop, same process                |
| Scale2       | **Separate service, NATS Request-Reply** | CPU isolation, independent scaling, multi-service reuse              |
| Post-Scale2  | **Separate service, gRPC**               | Type safety, binary protocol, no broker in critical synchronous path |

---

## Q2 — If Workflow Execution Loses Connection, Rule Engine Is Idle. Is That a Problem?

### The Concern Is Valid But Incomplete

Yes — the Rule Engine currently has exactly **one caller**: the Workflow Execution Service. If Execution goes down, Rule Engine has no work. But this frames it backwards. The risk is the **other direction**: Rule Engine going down while Execution Service is running fine. In that scenario:

- Execution Service receives a transition request.
- It sends a NATS Request-Reply to Rule Engine.
- No response arrives (timeout).
- **The transition is blocked.** No state change occurs.

That is the actual production failure mode. Here is the mitigation strategy:

---

### Failure Mode Matrix

| Scenario                                 | What Happens                                               | Mitigation                                                                              |
| ---------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Rule Engine pod crashes, restarts in 10s | NATS Request-Reply times out, transition rejected with 503 | Kubernetes auto-restart + NATS client reconnect. Client retries with idempotency key    |
| Rule Engine cluster fully down           | All transitions that have conditions are blocked           | Embedded fallback evaluator in Execution Service (fail-closed)                          |
| Execution Service goes down              | Rule Engine is idle, no requests                           | Not a data integrity problem. Rule Engine simply has no work                            |
| NATS goes down                           | Both services lose their communication channel             | See Q4 — NATS cluster mitigation                                                        |
| Rule Engine slow (high CPU)              | NATS Request-Reply hits timeout                            | Circuit breaker on Execution Service, queue-group auto-distributes load to healthy pods |

---

### Recommended Mitigation: Embedded Fallback Evaluator

Execution Service should carry a **lightweight, stripped-down, in-process fallback** rule evaluator that activates only when Rule Engine is unreachable (circuit breaker open). This fallback handles simple conditions (field comparisons, role checks) and **fails closed** on complex rules it cannot evaluate.

```
Primary path:  Execution → NATS Request-Reply → Rule Engine (full evaluator)
Fallback path: Execution → Embedded Evaluator (simple conditions only)
Circuit:       Opens after 3 consecutive timeouts, half-opens after 30s
```

This ensures that simple-condition workflows (the majority) never block because of a Rule Engine outage, while complex-condition workflows fail safely with an explicit error.

---

### Also: The Idle Problem Is Not Really a Problem

An idle service in Kubernetes costs almost nothing (it consumes its memory footprint and minimal CPU). The operational overhead is in the deployment pipeline, not in the runtime. At Scale2, the Rule Engine will receive calls from other callers anyway, making it non-idle even if Execution Service is temporarily down.

---

## Q3 — Why NATS Over gRPC for Workflow Execution ↔ Rule Engine Communication?

### The Full Comparison

| Criterion                | NATS Request-Reply                                | gRPC                                               |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------- |
| **Latency**              | ~1–3ms (NATS hop included)                        | ~0.3–1ms (direct TCP, no broker)                   |
| **Type safety**          | JSON payload, no schema enforcement               | Protobuf — compile-time schema enforcement         |
| **Load balancing**       | Native via NATS queue groups — zero config        | Client-side or Envoy/Istio — requires config       |
| **Service discovery**    | Automatic — NATS handles routing                  | Requires k8s DNS or service mesh                   |
| **Broker dependency**    | Yes — NATS must be up                             | No — direct TCP between pods                       |
| **Observability**        | Harder to trace (requires OTEL baggage over NATS) | Native gRPC interceptors, first-class OTEL support |
| **Schema evolution**     | Manual versioning (JSON field additions)          | Backward-compatible via Protobuf field numbering   |
| **Already in stack**     | ✅ Yes                                            | ❌ No — new dependency                             |
| **Failure surface**      | NATS failure blocks Rule Engine calls             | Independent of NATS                                |
| **Streaming support**    | Not for this use case                             | Native bi-directional streaming                    |
| **Code generation**      | None                                              | Proto → TypeScript stubs via `ts-proto`            |
| **Implementation speed** | Fast — already configured                         | Moderate — new proto files, codegen setup          |

---

### Verdict by Scale

#### Scale1 → NATS Request-Reply is the right choice

NATS is already in the stack. The ~2ms overhead is acceptable. The simplicity of NATS queue groups giving you automatic load balancing across Rule Engine pods with zero configuration is a genuine advantage. Introducing gRPC at this stage adds operational complexity without a measurable benefit.

#### Scale2 → gRPC is the better choice for this specific pair

The Execution ↔ Rule Engine call is the **hot synchronous path** in every transition. At 100K concurrent users with heavy rule evaluation, the NATS broker becomes an intermediary in the critical path. More importantly:

1. A NATS cluster failure takes down both service-to-service messaging AND this critical sync call simultaneously.
2. With gRPC, Rule Engine communication survives a NATS outage.
3. Protobuf schema enforcement prevents silent contract drift between services during fast iteration.
4. gRPC interceptors provide native distributed tracing without the custom OTEL-over-NATS bridge you'd need for NATS.

**The ideal Scale2 split:**

| Communication type                                               | Protocol                    |
| ---------------------------------------------------------------- | --------------------------- |
| Execution → Rule Engine (sync, critical path)                    | **gRPC**                    |
| Execution → Audit, Notification, Analytics (async, side effects) | **NATS JetStream / Kafka**  |
| Real-time fanout (Chat presence, typing)                         | **NATS PUB/SUB**            |
| Cross-service domain events                                      | **NATS JetStream or Kafka** |

---

## Q4 — NATS and Kong Are Both Single Points of Failure. Mitigations?

### They Are Not SPOFs by Design — But Need to Be Configured Correctly

---

### NATS — Mitigation

The diagram specifies "NATS: Clustered." JetStream runs on top of the NATS cluster with Raft consensus. Here is the full mitigation stack:

| Layer                         | Mitigation                                                    | Detail                                                                                               |
| ----------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Cluster size**              | Minimum 3-node cluster                                        | Raft quorum requires majority. 3 nodes tolerate 1 failure. For Scale2: 5 nodes, tolerates 2 failures |
| **JetStream replication**     | `R=3` for critical streams                                    | Each stream message replicated to 3 nodes. One node dying loses no messages                          |
| **Client reconnect**          | NestJS NATS transport auto-reconnects                         | Configure `maxReconnectAttempts: -1` (infinite) with exponential backoff                             |
| **Request-Reply timeout**     | Set explicit timeout (~500ms) on all synchronous calls        | Prevents hanging callers on NATS slowdown                                                            |
| **Subject-level permissions** | NATS account credentials per service                          | Auth Service cannot publish on `workflow-execution.*` subjects                                       |
| **Multi-AZ deployment**       | Spread 3 NATS nodes across 3 AZs                              | Full AZ failure only loses 1 Raft voter — cluster stays up                                           |
| **Health checks**             | Kubernetes liveness probe on NATS HTTP monitoring port (8222) | Failed pods restart automatically                                                                    |
| **Sync path bypass**          | gRPC for Execution↔RuleEngine (see Q3)                        | Critical sync path does not route through NATS at Scale2                                             |

**The residual risk:** A network partition that splits the 3-node cluster into 1+2 causes the minority partition (1 node) to stop accepting writes. Clients connected to the minority node see a brief unavailability. This is the correct behavior (consistency over availability for the write path). JetStream client reconnect resolves this within seconds.

---

### Kong — Mitigation

The diagram already specifies "Kong with Horizontal Pods." That is the primary mitigation. Full stack:

| Layer                     | Mitigation                         | Detail                                                                   |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| **Horizontal scaling**    | Multiple Kong pods (min 2 per AZ)  | AWS ALB distributes traffic across all healthy Kong pods                 |
| **DB-less mode**          | Kong declarative config via `deck` | Kong has no database dependency — config is GitOps managed, no DB SPOF   |
| **AWS ALB**               | Multi-AZ, built-in health checks   | ALB removes a Kong pod from rotation within ~30s of failure              |
| **AWS WAF + Shield**      | Sits upstream of Kong              | DDoS attacks absorbed before reaching Kong                               |
| **CloudFront**            | Caches static responses at edge    | Reduces traffic volume hitting Kong, absorbs read spikes                 |
| **Config recovery**       | `deck sync` from Git in CI/CD      | Full Kong state restored from Git in under 2 minutes if cluster is wiped |
| **Circuit breakers**      | Kong's circuit breaker plugin      | Kong stops routing to a downstream service if its health check fails     |
| **Rate limiting at Kong** | Per-tenant, per-API-key            | Prevents a single misbehaving client from saturating Kong pods           |

**Future-proofing:** The diagram notes the migration path to Istio/Envoy Service Mesh. At Scale2, Kong handles north-south traffic (external clients → cluster), while Istio/Envoy handles east-west traffic (service to service). This completely removes Kong from the internal service communication path, eliminating it as any kind of internal SPOF.

---

### The Real SPOF Nobody Talks About: PostgreSQL Primary

Both NATS and Kong have good mitigation paths. The harder SPOF is the **PostgreSQL write primary**. Every transition goes through it. Multi-AZ RDS with automatic failover, PgBouncer for connection pooling, and `RTO < 5 minutes` is the correct answer here — and it is in the diagram. But it deserves explicit mention since it is the harder constraint to eliminate than NATS or Kong.

---

## Q5 — Is Kafka Still Necessary With NATS JetStream?

### Direct Answer

**At Scale1: No. NATS JetStream alone is sufficient.**  
**At Scale2: Yes, for three specific capabilities JetStream cannot match.**

---

### What NATS JetStream Can Do (That Used to Require Kafka)

| Capability                    | JetStream              | Kafka                     |
| ----------------------------- | ---------------------- | ------------------------- |
| At-least-once delivery        | ✅                     | ✅                        |
| Consumer acknowledgements     | ✅                     | ✅                        |
| Durable subscriptions         | ✅                     | ✅                        |
| Multiple consumer groups      | ✅                     | ✅                        |
| Replay from sequence/time     | ✅                     | ✅                        |
| Dead letter queues            | ✅ (via `max_deliver`) | ✅                        |
| Message retention by age/size | ✅                     | ✅                        |
| Subject-level filtering       | ✅ (native)            | ✅ (via topic partitions) |
| Horizontal scaling            | ✅                     | ✅                        |
| Request-Reply (sync RPC)      | ✅ (native)            | ❌                        |

JetStream is not "NATS with Kafka bolted on." It is a genuinely capable durable streaming layer. For most use cases in this platform at Scale1, JetStream covers everything the diagram allocates to Kafka.

---

### What Kafka Does That JetStream Cannot Match

| Capability                               | JetStream                | Kafka                                                  | Impact                                                        |
| ---------------------------------------- | ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------- |
| **Log compaction** (keep latest per key) | ❌                       | ✅                                                     | Needed for materialised views, state snapshots                |
| **Tiered storage** (S3-backed archival)  | ❌                       | ✅ (Confluent / MSK)                                   | HIPAA: 7-year audit log retention without disk cost explosion |
| **Throughput ceiling**                   | ~10–50M msg/sec cluster  | >100M msg/sec cluster                                  | Scale2 analytics pipelines exceed JetStream's tested ceiling  |
| **Ecosystem connectors**                 | Very limited             | Kafka Connect (S3, MongoDB, Redshift, ES sinks)        | Analytics pipelines, data warehouse feeds                     |
| **Stream processing**                    | Limited                  | Kafka Streams, ksqlDB, Flink integration               | Real-time analytics, tenant usage metering                    |
| **Cross-region replication**             | Experimental geo-cluster | MirrorMaker2 / Confluent Replicator (production-grade) | Multi-region active-active at Scale2                          |
| **Schema registry**                      | None                     | Confluent / AWS Glue Schema Registry                   | Schema evolution guarantees across consumer versions          |

---

### Recommended Strategy

| Phase          | Messaging Stack                                         | Rationale                                                      |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| MVP            | NATS Core                                               | Fast, simple, zero ops overhead                                |
| Scale1         | NATS + JetStream                                        | Add durability, DLQ, at-least-once for audit/notifications     |
| Scale2 (early) | NATS JetStream + Kafka (analytics only)                 | Add Kafka only for the analytics pipeline — one topic to start |
| Scale2 (full)  | NATS JetStream + Kafka (audit, analytics, chat history) | Full dual-bus as currently designed                            |

**The pragmatic rule:** Introduce Kafka when you can demonstrate that JetStream's limits are your bottleneck, not before. Adding Kafka prematurely doubles your messaging infrastructure, your operational burden, your monitoring surface, and your engineering on-call runbook complexity.

---

## Q6 — Is the Observability Stack Overkill?

### What the Stack Contains

From the diagram labels and Notes section:

| Tool         | Category                     | Hosting     | Purpose as Shown                         |
| ------------ | ---------------------------- | ----------- | ---------------------------------------- |
| Sentry       | Error tracking               | Self-hosted | Detailed error tracking                  |
| Grafana Loki | Log aggregation + dashboards | Self-hosted | Visualization, analytics, log dashboards |
| SigNoz       | APM & Distributed Tracing    | Unclear     | APM & Traces                             |
| New Relic    | APM & Distributed Tracing    | SaaS        | APM & Traces                             |
| CloudWatch   | AWS infrastructure metrics   | AWS managed | Infra metrics, WAF logs, edge logs       |

---

### The Critical Problem: SigNoz AND New Relic

Both SigNoz and New Relic appear as separate boxes in the diagram doing **identical jobs** — APM and distributed tracing. This is not a complementary pairing. It is a **direct collision**:

- Two sets of agents/SDKs instrumented in every service
- Two dashboards, two alert configurations, two sources of truth for the same trace
- Two contracts, two vendor relationships
- Engineers will look at different tools and see different numbers
- The data is not shared — traces in SigNoz are not in New Relic

**This needs to be resolved. Pick one APM tool.**

---

### Overkill Assessment by Scale

#### Scale1 (10K concurrent, 1K tenants)

| Tool                 | Verdict                            | Reason                                                                         |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Sentry (self-hosted) | ✅ Keep                            | Excellent error tracking, free self-hosted, low resource cost                  |
| Grafana Loki         | ✅ Keep                            | Essential for log aggregation in Kubernetes, pairs with Grafana                |
| SigNoz               | ✅ Keep (choose this OR New Relic) | Self-hostable, OpenTelemetry native, zero SaaS cost, good for early stage      |
| New Relic            | ❌ Remove                          | SaaS cost at Scale1 is hard to justify vs SigNoz. Expensive at 10K+ events/min |
| CloudWatch           | ✅ Keep                            | Free with AWS, captures ALB/WAF/EKS infra metrics without any effort           |

**Scale1 Recommended Stack:** Sentry + Grafana Loki + Grafana + SigNoz + CloudWatch

---

#### Scale2 (100K concurrent, 10K tenants)

| Tool                                | Verdict                             | Reason                                                                                           |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Sentry (self-hosted or cloud)       | ✅ Keep                             | At Scale2 consider Sentry Cloud — self-hosted Sentry has operational overhead                    |
| Grafana Loki + Prometheus + Grafana | ✅ Keep + Expand                    | Add Prometheus at Scale2 for pod-level metrics, service-level SLO dashboards                     |
| New Relic                           | ✅ Preferred at Scale2              | Enterprise support, superior distributed tracing UX, better anomaly detection AI, SLA guarantees |
| SigNoz                              | ❌ Replace with New Relic at Scale2 | SigNoz is excellent but lacks enterprise support, advanced ML-based alerting                     |
| CloudWatch                          | ✅ Keep                             | Non-negotiable for AWS-managed services                                                          |

**Scale2 Recommended Stack:** Sentry + Grafana + Prometheus + Grafana Loki + New Relic + CloudWatch

---

### Pros and Cons of Each Tool Considered

| Tool                                            | Pros                                                                                 | Cons                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Sentry (self-hosted)**                        | Free, excellent stack traces, releases tracking, source maps                         | Requires maintenance, storage costs grow with event volume                        |
| **Grafana Loki**                                | Cheap log storage (no indexing), native Grafana integration, Kubernetes-native       | Query performance slower than Elasticsearch for full-text search at huge volumes  |
| **Grafana + Prometheus**                        | Industry standard, massive ecosystem, alerting built-in                              | Prometheus storage is not long-term; needs Thanos or Cortex at Scale2             |
| **SigNoz**                                      | OpenTelemetry native, self-hostable (no SaaS cost), ClickHouse backend (fast)        | Smaller community, no enterprise support tier, less mature than Datadog/New Relic |
| **New Relic**                                   | Mature, excellent distributed tracing UI, ML-based anomaly detection, enterprise SLA | Expensive at high data volumes, vendor lock-in, data egress costs                 |
| **Datadog** _(not in stack, worth considering)_ | Best-in-class UX, full-stack observability in one tool, APM+Logs+Metrics unified     | Most expensive option; can replace Grafana + SigNoz + partial CloudWatch          |
| **CloudWatch**                                  | Zero setup for AWS infra, integrated with ALB/RDS/EKS natively                       | Expensive for custom metrics at scale, poor UX for application-level tracing      |

---

### Recommended Simplified Observability Stack

```
Scale1:
  Errors:    Sentry (self-hosted)
  Logs:      Grafana Loki + Grafana
  Traces:    SigNoz (OpenTelemetry collector → ClickHouse)
  Infra:     CloudWatch
  Cost:      ~$0 SaaS (all self-hosted) + infra compute

Scale2:
  Errors:    Sentry Cloud (Pro)
  Logs:      Grafana Loki + Grafana + Prometheus
  Traces:    New Relic (or Datadog — evaluate at this point)
  Infra:     CloudWatch
  Cost:      Predictable SaaS contract with enterprise support
```

The key principle: **one tool per observability signal** (one for traces, one for logs, one for errors, one for metrics). The current diagram violates this by having two APM tools.

---

## Q7 — Architectural Gaps in the Diagram

Listed precisely. No explanations unless asked.

1. **SigNoz and New Relic both shown doing APM & Traces** — redundant, no resolution shown
2. **PgBouncer mentioned in Notes but absent from diagram** — connection pooling is unrepresented in the topology
3. **No Redis session registry shown for Chat Service WebSocket connection management** — pod-to-WebSocket mapping is missing
4. **No Kafka Schema Registry shown** — schema evolution strategy for Kafka consumers is unaddressed
5. **NATS JetStream stream backup strategy not defined** — PostgreSQL and MongoDB have backup plans; NATS streams do not
6. **Malware Scanner has no data flow path shown** — input source (S3 event? API upload? NATS event?), output destination, and trigger mechanism are all absent
7. **No distributed trace context propagation strategy across NATS events** — OpenTelemetry baggage over NATS requires explicit implementation, not shown
8. **ChatBot Service has no AI/LLM backend shown** — "ChatBot as Service" implies an inference endpoint or model; it is absent
9. **Stripe webhook ingress path not shown** — inbound Stripe webhooks need a dedicated public endpoint with signature verification, separate from the Kong-protected API
10. **No inter-service authentication shown for NATS** — which credentials/accounts does each service use to publish/subscribe on NATS subjects
11. **No NATS subject-level authorization policy shown** — any service can publish to any subject without explicit access control shown
12. **MongoDB migration path from PostgreSQL audit is undefined** — the MVP uses PostgreSQL for audit logs; the transition strategy to MongoDB at scale is not shown
13. **No read replica routing strategy shown** — what decides when reads go to replicas vs. primary is not visible in the diagram
14. **DLQ consumer/processor is not shown as a service** — Kafka DLQ exists but no service is shown consuming and reprocessing DLQ messages
15. **Tenant provisioning automation flow is absent** — how a new tenant gets its schema context, default data, and onboarding events is not in the diagram

---

## Q8 — Is There a Simplified, More Accurate Architecture?

**YES.**

The current diagram conflates the Scale1 (now) reality with the Scale2 (future) target without clearly delineating what is MVP and what is evolution. A simplified, accurate architecture exists and is described in Q9.

---

## Q9 — Is This Architecture Over-Engineered?

**YES, for Scale1.**  
**Appropriately ambitious for Scale2, with some corrections needed.**

---

### What Is Over-Engineered at Scale1

| Component                           | Current                              | Problem                                                                                                     | Replacement                                                                      |
| ----------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Kafka**                           | Full multi-broker cluster            | Scale1 traffic does not require Kafka throughput or ecosystem. JetStream covers all stated use cases        | **NATS JetStream only**                                                          |
| **Rule Engine as separate service** | Deployed as independent microservice | Adds a network hop to every transition. CPU profile does not justify isolation at 10K users                 | **Library inside Execution Service**                                             |
| **New Relic + SigNoz**              | Both deployed simultaneously         | Redundant APM. Double cost, double maintenance, contradictory dashboards                                    | **SigNoz only at Scale1**                                                        |
| **MongoDB for Audit**               | Separate document store              | At Scale1 with 10M instances, PostgreSQL with append-only audit table and partitioning handles this cleanly | **PostgreSQL for audit at Scale1**                                               |
| **Malware Scanner**                 | Separate service in diagram          | Only relevant if the platform allows tenant file uploads. Not mentioned as a core workflow engine feature   | **Add only if file uploads are a confirmed feature**                             |
| **Kong (self-hosted)**              | Kubernetes-native, self-hosted       | Significant operational overhead to run and maintain at Scale1. A simpler option exists                     | **Traefik (for Scale1 k8s ingress) or AWS API Gateway (if serverless-adjacent)** |

---

### Trade-off Tables for Proposed Replacements

#### Kafka → NATS JetStream (Scale1)

|                                | Kafka                                                    | NATS JetStream                                                                         |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Setup complexity**           | High (Zookeeper/KRaft, brokers, topics)                  | Low (built into NATS, stream config in code)                                           |
| **Ops overhead**               | High (cluster management, rebalancing)                   | Low (NATS cluster already in stack)                                                    |
| **Throughput (Scale1)**        | Overkill — Kafka handles 1M+/sec; Scale1 needs ~100K/sec | More than sufficient                                                                   |
| **Analytics pipeline**         | ✅ Kafka Connect, Flink, ksqlDB                          | ❌ No ecosystem — need custom consumers                                                |
| **Long-term retention**        | ✅ Tiered storage, S3 archival                           | ❌ Disk-bound, no archival tier                                                        |
| **Compliance retention (7yr)** | ✅                                                       | ❌                                                                                     |
| **Cost at Scale1**             | High (MSK or self-managed cluster)                       | Near-zero (runs on same NATS cluster)                                                  |
| **Migration path to Kafka**    | —                                                        | Clean — JetStream consumers can be replaced with Kafka consumers, same event contracts |

**Verdict:** Replace Kafka with JetStream at Scale1. Re-evaluate at Scale2 when analytics pipeline or compliance retention is a demonstrated need.

---

#### Rule Engine Separate Service → Library in Execution Service (Scale1)

|                            | Separate Service                                            | Library in Execution Service                          |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| **Latency per transition** | +2–4ms (NATS round trip)                                    | ~0ms (in-process function call)                       |
| **Independent scaling**    | ✅ Can scale CPU separately                                 | ❌ Scale whole Execution pod                          |
| **Failure surface**        | 2 services to monitor/deploy                                | 1 service                                             |
| **Code extraction cost**   | Now                                                         | Later (contracts already defined)                     |
| **CPU isolation**          | ✅                                                          | ❌                                                    |
| **Operational overhead**   | High (separate k8s deployment, healthchecks, scaling rules) | None                                                  |
| **Microservice readiness** | ✅ Already extracted                                        | ✅ Still extraction-ready (contract interface exists) |

**Verdict:** Keep Rule Engine as a library at Scale1. The contract interface (`RULE_ENGINE_CONTRACT`) is already in place — extracting it at Scale2 is a 1-day operation.

---

#### SigNoz + New Relic → SigNoz Only (Scale1)

|                            | SigNoz                         | New Relic                               |
| -------------------------- | ------------------------------ | --------------------------------------- |
| **Cost**                   | Free (self-hosted)             | ~$0.25/GB ingested (expensive at scale) |
| **OpenTelemetry native**   | ✅ First-class                 | ✅ (adapter required)                   |
| **Self-hostable**          | ✅                             | ❌ SaaS only                            |
| **Enterprise support**     | ❌                             | ✅                                      |
| **Distributed tracing UI** | Good                           | Excellent                               |
| **Anomaly detection**      | Basic                          | ML-powered                              |
| **Suitable at Scale1**     | ✅                             | ⚠️ Cost-prohibitive                     |
| **Suitable at Scale2**     | ⚠️ Limited enterprise features | ✅                                      |

**Verdict:** SigNoz at Scale1, New Relic at Scale2.

---

#### Kong (Scale1) → Traefik

|                            | Kong                                                   | Traefik                                    |
| -------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| **Setup complexity**       | High (declarative config, plugins, DB or DB-less mode) | Low (annotations on k8s ingress resources) |
| **Kubernetes native**      | Partially (k8s operator available)                     | ✅ First-class                             |
| **Plugin ecosystem**       | Very rich (rate limit, JWT, OAuth, transform)          | Good (basic middleware)                    |
| **Rate limiting**          | Per-tenant, per-API-key natively                       | Per-IP, per-service (less granular)        |
| **Multi-tenant isolation** | ✅ (Bulkhead plugin)                                   | ❌ Requires custom middleware              |
| **Performance**            | 1–5ms (as noted in diagram)                            | ~0.5–2ms                                   |
| **Operational overhead**   | High                                                   | Low                                        |
| **Scale2 suitability**     | ✅                                                     | ❌ (lacks advanced multi-tenant features)  |

**Verdict:** Traefik is fine for Scale1 internal deployments. If multi-tenant rate limiting and per-tenant routing policies are needed from day one, keep Kong — but accept the operational cost. Kong is the right long-term choice.

---

### Simplified Scale1 Architecture (What to Actually Build Now)

```
Internet Traffic
       │
       ▼
CloudFront (CDN, TLS)
       │
       ▼
AWS ALB (Multi-AZ, HTTPS)
       │
       ▼
Kong / Traefik (JWT validation, rate limiting, routing)
       │
       ├──────────────────────────────────────────────┐
       ▼                                              ▼
NestJS Modular Monolith                         NATS + JetStream
(Auth, Tenant, WorkflowDef,                    (Command Bus + Durable Streams)
 WorkflowExec + RuleEngine lib,                       │
 Audit, Notification, Chat)                    ├── audit.log stream (JetStream)
       │                                       ├── notification.* stream
       ├── PostgreSQL RDS (Primary + 1 Replica)├── chat.message.* PUB/SUB
       ├── Redis ElastiCache                   └── domain events (all NatsEvents)
       └── AWS S3 (files, backups)

Observability:
  Sentry (self-hosted) + Grafana Loki + SigNoz + CloudWatch

Payments: Stripe (webhook endpoint outside Kong, signature verified)
Email: AWS SES
SMS: AWS SNS
```

**What is NOT built at Scale1:**

- Kafka (introduce at Scale2 for analytics/archival)
- Rule Engine as separate service (library only, extractable later)
- MongoDB (PostgreSQL handles audit at this scale)
- New Relic (SigNoz covers it)
- Malware Scanner (unless file uploads confirmed as feature)
- Separate Analytics Service (CloudWatch + SigNoz dashboards cover it)

---

### Full Scale2 Architecture (What the Diagram Shows — Mostly Correct)

At Scale2, **the current diagram is largely correct** with these corrections applied:

1. Remove one of SigNoz / New Relic (choose New Relic for enterprise support)
2. Add PgBouncer explicitly to the diagram
3. Add Redis WebSocket session registry to Chat Service
4. Add Kafka Schema Registry
5. Add NATS JetStream backup strategy
6. Add gRPC connection between Execution Service and Rule Engine (replace NATS for this specific pair)
7. Clarify DLQ processor as an explicit service
8. Add mTLS (Istio/Envoy already planned — accelerate this at Scale2)

---

## Summary Table — All 9 Questions

| #   | Question                            | Answer                                                                                                                            | Key Action                                                        |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Why Rule Engine separate?           | Valid at Scale2 — CPU isolation, independent scaling, reuse. Premature at Scale1.                                                 | Keep as library at Scale1, extract at Scale2                      |
| 2   | Rule Engine idle if Execution down? | Valid concern. Failure flows the other way (Rule Engine down → transitions blocked).                                              | Add circuit breaker + embedded fallback evaluator                 |
| 3   | NATS vs gRPC for Exec↔RuleEngine?   | NATS at Scale1 (already in stack). gRPC at Scale2 (no broker in critical path, type safety).                                      | Migrate to gRPC at Scale2 for this specific pair                  |
| 4   | NATS and Kong as SPOFs?             | Mitigated by clustering, multi-AZ, DB-less Kong, ALB. Real SPOF is PostgreSQL primary.                                            | 3-node NATS cluster + horizontal Kong pods + PgBouncer            |
| 5   | Kafka necessary with JetStream?     | Not at Scale1. At Scale2: yes, for analytics pipeline, long-term archival, cross-region replication.                              | JetStream-only at Scale1, introduce Kafka at Scale2 for analytics |
| 6   | Observability overkill?             | Yes — SigNoz + New Relic is redundant. Simplified stack saves cost and confusion.                                                 | SigNoz at Scale1, New Relic at Scale2. Remove the other.          |
| 7   | Architectural gaps?                 | 15 identified gaps. Key: no WebSocket registry, no Kafka Schema Registry, no DLQ processor service, malware scanner flow missing. | See full list in Q7                                               |
| 8   | Simpler accurate architecture?      | Yes — Scale1 does not need Kafka, separate Rule Engine, MongoDB audit, or New Relic.                                              | See simplified Scale1 architecture above                          |
| 9   | Over-engineered?                    | Yes at Scale1. Specifically: Kafka, Rule Engine service, duplicate APM, MongoDB audit at MVP.                                     | Remove and simplify as per Q9 trade-off tables                    |

---

_Document generated from full analysis of `01-SYSTEM-ARCHITECTURE.md`, `FlowForge_Workflow_Engine__drawio.svg` (including all embedded Notes and diagram annotations), and `nats-events.enum.ts`._
