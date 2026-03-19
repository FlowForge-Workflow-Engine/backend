# Questions and Answers

## Scale Targets Referenced Throughout

| Label | Concurrent Users | Tenants | Total Users | Workflow Instances |
|---|---|---|---|---|
| **Scale1** | 10K | 1K | 1M+ | 10M+ |
| **Scale2** | 100K | 10K | 10M+ | 100M+ |


## 1. Observability Stack: Can you use OpenTelemetry + Grafana, or SigNoz is required?

As per the architecture, we are using SigNoz + Grafana + Sentry for Observability and this combination makes sense only when
- SigNoz → metrics + traces + logs
- Grafana → custom dashboards / multi-source data
- Sentry → best-in-class error tracking

This is a valid design for `Scale-1` and may even require `New Relic / Datadog` for `Scale-2`. The reasons are as follows:

--- 

### SigNoz

If `OTel + Grafana` is used, then simply it's not enough as OTel is a `standard + SDK + Collector`. You will still need:
- **Prometheus**: Backend Storage, Metrics
- **Tempo/Jaeger**: Traces
- **Loki/Elasticsearch**: Logs

| Pros                         | Cons                                      |
|:------------------------------:|:-------------------------------------------:|
| Maximum flexibility          | Operational overhead 😬                  |
| Best-in-class components     | Correlation is harder (metrics ↔ traces ↔ logs) |
| Huge ecosystem               | More moving parts to maintain            |
|                              | Requires expertise                       |

However, with SigNoz, it provides a complete solution for `metrics + traces + logs + custom dashboards + alerting + error tracking`.

    SigNoz = backend(ClickHouse) + UI + opinionated observability platform

| Pros                          | Cons                                               |
|-------------------------------|----------------------------------------------------|
| Single backend (ClickHouse)   | Less modular                                       |
| Native OTel support           | Less customizable than full Grafana ecosystem      |
| Built-in correlation          | Not as mature in some areas as specialized tools   |
| trace ↔ logs ↔ metrics        |                                                    |
| Faster setup                  |                                                    |
| Lower operational burden      |                                                    |

---

### Grafana

- Grafana is still required here since SigNoz is not a full-fledged observability platform. 
- It's more of a `backend + UI for metrics + traces + logs`.

#### Grafana advantages:
- Multi-source dashboards:
    - DBs (Postgres, MySQL)
    - SaaS tools
    - Cloud metrics (AWS, GCP, Azure)
- Advanced panel customization
- Rich alerting ecosystem
- Plugins ecosystem

Example:
- Business KPI dashboard (revenue, users, etc.)
- Mixing infra + product analytics

**SigNoz is not designed for that breadth**

| Use case                                 | Keep Grafana? |
| ---------------------------------------- | ------------- |
| Only observability (metrics/traces/logs) | ❌ No          |
| Cross-data dashboards (business + infra) | ✅ Yes         |
| Heavy customization needed               | ✅ Yes         |

---

### Sentry
- The stack: `OTel + Prometheus + Loki + Tempo + Grafana` doesn't cover the developer friendly error tracking that Sentry provides.

- SigNoz is more of a `backend + UI for metrics + traces + logs + Basic Exceptions`. It's not designed for error tracking.

- SigNoz is backend observability-focused

#### Sentry is required since:
- You have a frontend app (React, mobile, etc.)
- You want developer-friendly error tracking
- You care about:
    - stack traces grouped into issues
    - release-based debugging
- You want faster debugging vs digging logs

---

### Decision Matrix
Ask 3 questions:

| Question                                      | Yes → Action                          | No → Action                     |
|-----------------------------------------------|---------------------------------------|----------------------------------|
| Do we need cross-data dashboards?             | Keep Grafana                          | Remove it                        |
| Do we need developer-grade error tracking?    | Keep Sentry                           | SigNoz alone is sufficient       |
| Do we want low-maintenance infra?             | Favor SigNoz over DIY stack           | `OTel + Prometheus + Loki + Tempo/Jaeger + Grafana`                                |

---

### Rational for New Relic / Datadog

#### 🧠 In-Comparison with `OTel + Prometheus + Loki + Tempo + Grafana`
| Aspect                           | DIY Grafana Stack                               | New Relic / Datadog Advantages                                                     |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Setup / Maintenance**          | You manage all components, upgrades, scaling    | Fully managed SaaS, no infrastructure maintenance                                  |
| **Data Correlation**             | Needs manual config for logs ↔ metrics ↔ traces | Built-in correlation and AI-assisted linking across all signals                    |
| **Alerting / Anomaly Detection** | Prometheus + Grafana alerts (threshold-based)   | ML-based anomaly detection, predictive alerts, smarter notifications               |
| **Dashboards**                   | Custom dashboards required                      | Pre-built dashboards for common services (K8s, AWS, databases)                     |
| **Integrations**                 | Manual or via community exporters               | Hundreds of native integrations with minimal setup                                 |
| **Scalability**                  | You scale storage and ingestion yourself        | Handles large-scale data automatically                                             |
| **Developer Experience**         | No “issue tracking”                             | Rich developer tooling: code-level insights, transaction breakdowns                |
| **Support**                      | Community forums                                | Enterprise-grade support, SLAs                                                     |
| **Advanced Analytics**           | Custom queries only                             | Built-in analytics (e.g., high-cardinality metrics, distributed tracing analytics) |


#### 🧠 In Comparison with `SigNoz + Grafana + Sentry`
| Aspect                   | SigNoz + Sentry + Grafana                     | New Relic / Datadog Advantages                               |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------ |
| **Maintenance**          | Self-hosted → you handle upgrades and scaling | SaaS, maintenance-free                                       |
| **Unified Platform**     | Signals split (SigNoz vs Sentry)              | One integrated platform (traces, metrics, logs, errors)      |
| **Alerting / AI**        | Limited; mostly threshold-based               | Advanced anomaly detection, AI-assisted alerts               |
| **Integrations**         | Fewer, mostly OSS or manual                   | Hundreds of integrations with cloud services, SaaS apps      |
| **Analytics / Insights** | Manual dashboards                             | Built-in analysis for performance, error trends, user impact |
| **Enterprise Features**  | Limited                                       | SLAs, role-based access, audit logs, compliance features     |

---

### 🤔 Decision Martix
| Feature      | OTel + Grafana DIY | SigNoz + Sentry  | New Relic / Datadog      |
| ------------ | ------------------ | ---------------- | ------------------------ |
| Traces       | ✅                  | ✅                | ✅                        |
| Metrics      | ✅                  | ✅                | ✅                        |
| Logs         | ✅                  | ✅                | ✅                        |
| Errors       | ❌ / partial        | ✅                | ✅                        |
| OpenSource       | ✅        | ✅                | ❌                        |
| Dashboards   | Custom             | Custom / limited | Rich pre-built           |
| Alerting     | Basic              | Basic            | Advanced, AI-based       |
| Integrations | Manual             | Limited          | Hundreds, out-of-the-box |
| Scalability  | Manual             | Manual           | Automatic                |
| Maintenance  | High               | Medium           | Low                      |
| Cost         | Low                | Medium           | High                     |

---

### After Scaling to Global Level

    Scale 1: ✅ 1k tenants, 1k users/tenants = 1M users, 10k concurrent users, 10M+ workflow instances
    Scale 2: ✅ 10k tenants, 1k users/tenants = 10M+ users, 100k concurrent users, 100M+ workflow instances

| Factor                      | OTel + Prometheus + Loki + Tempo + Grafana | SigNoz + Sentry <br>+ Grafana  | Reality at 1M users + 10M workflows                                                                       |
|----------------------------|-----------------------------------------------|------------------------------|------------------------------------|
| **Complexity**                       | High                                                  | Moderate                                                   | • Very high for DIY <br>  • High for SigNoz + Sentry — scaling multiple components, clustering, multi-tenant setup |
| **Cost**                             | Infra-only                                            | Mostly infra cost                                          | Storage & compute costs grow significantly at this scale                                                  |
| **Maintenance**                      | You manage                                            | You manage                                                 | Significant engineering effort for both stacks; DIY higher                                                |
| **Multi-tenancy support**            | Requires careful tagging and dashboards               | Limited → requires custom tenant tagging                   | Must implement aggregation, downsampling, and dashboards carefully for 1M users and 10M workflows         |
| **Alerting / AI**                    | Threshold-based alerts only                           | Basic threshold alerts; Sentry adds issue-based alerts     | DIY has no anomaly detection; SigNoz + Sentry better for dev error alerts but may need extra tooling      |
| **Developer-focused error insights** | ❌ Only logs/traces; no automated grouping             | ✅ Sentry provides stack traces, grouping, release tracking | SigNoz + Sentry provides stronger developer insights; DIY stack requires digging into logs/traces         |
| **Flexibility**                      | ✅ Full control over <br> • Metrics <br> • Logs <br> • Retention <br> • Dashboards | ⚠️ Less flexible than DIY; dashboards limited              | DIY is most flexible; SigNoz easier to set up but less customizable                                       |


### Verdict

- For a startup / small-scale deployment / upto `Scale-1`: `SigNoz + Sentry + Grafana` → fine

- For `Scale-2`: production-grade, 10M+ users, 100M+ workflows, multi-tenant, AWS:
    - ❌ Likely overkill to self-host and maintain

    - ✅ Consider managed enterprise SaaS APM / observability platform (`New Relic/Datadog/AWS X-Ray + CloudWatch(partly) + Sentry + Grafana`) for scaling, alerting, and multi-tenancy support.

    - Cloudwatch: Free with AWS, captures ALB/WAF/EKS infra metrics without any effort

| Category            | Scale1                                              | Scale2                                                      |
|--------------------|-----------------------------------------------------|-------------------------------------------------------------|
| Errors             | Sentry (self-hosted)                                | Sentry Cloud (Pro)                                          |
| Logs               | Grafana Loki + Grafana                              | Grafana Loki + Grafana + Prometheus (Optional)                         |
| Metrics & Traces   | SigNoz (OpenTelemetry collector → ClickHouse)       | New Relic (or Datadog — evaluate at this point)             |
| Infra              | CloudWatch                                          | CloudWatch                                                  |
| Cost               | ~$0 SaaS (all self-hosted) + infra compute          | Predictable SaaS contract with enterprise support           |

---

## 2. Dual Bus Architecture Justification: NATS + Kafka, why not just NATS with JetStream?
- Kafka is present for future scale, from day-1 it's not required. 

### Direct Answer

    At Scale1: No. NATS JetStream alone is sufficient. 

    At Scale2: Yes, for three specific capabilities JetStream cannot match.

---

### What NATS JetStream Can Do (That Used to Require Kafka)

| Capability | JetStream | Kafka |
|---|---|---|
| At-least-once delivery | ✅ | ✅ |
| Consumer acknowledgements | ✅ | ✅ |
| Durable subscriptions | ✅ | ✅ |
| Multiple consumer groups | ✅ | ✅ |
| Replay from sequence/time | ✅ | ✅ |
| Dead letter queues | ✅ (via `max_deliver`) | ✅ |
| Message retention by age/size | ✅ | ✅ |
| Subject-level filtering | ✅ (native) | ✅ (via topic partitions) |
| Horizontal scaling | ✅ | ✅ |
| Request-Reply (sync RPC) | ✅ (native) | ❌ |


### What Kafka Does That JetStream Cannot Match

| Capability | JetStream | Kafka | Impact |
|---|---|---|---|
| **Log compaction** (keep latest per key) | ❌ | ✅ | Needed for materialised views, state snapshots |
| **Tiered storage** (S3-backed archival) | ❌ | ✅ (Confluent / MSK) | HIPAA: 7-year audit log retention without disk cost explosion |
| **Throughput ceiling** | ~10–50M msg/sec cluster | >100M msg/sec cluster | Scale2 analytics pipelines exceed JetStream's tested ceiling |
| **Ecosystem connectors** | Very limited | Kafka Connect (S3, MongoDB, Redshift, ES sinks) | Analytics pipelines, data warehouse feeds |
| **Stream processing** | Limited | Kafka Streams, ksqlDB, Flink integration | Real-time analytics, tenant usage metering |
| **Cross-region replication** | Experimental geo-cluster | MirrorMaker2 / Confluent Replicator (production-grade) | Multi-region active-active at Scale2; Battle-tested |
| **Schema registry** | None | Confluent / AWS Glue Schema Registry | Schema evolution guarantees across consumer versions |


---

### Recommended Strategy
> Refer `docs/references/FlowForge_Throughput_Derivation.md` for throughput derivation and messaging stack recommendation
> `docs/references/FlowForge_Throughput_Derivation.md#Then Why Would You Ever Add Kafka? — The Real Reasons`

| Phase | Messaging Stack | Rationale |
|---|---|---|
| MVP | NATS Core | Fast, simple, zero ops overhead |
| Scale1 | NATS + JetStream | Add durability, DLQ, at-least-once for audit/notifications |
| Scale2 (early) | NATS JetStream + Kafka (analytics only) | Add Kafka only for the analytics pipeline — one topic to start |
| Scale2 (full) | NATS JetStream + Kafka (audit, analytics, chat history) | Full dual-bus as currently designed |

**The pragmatic rule:** Introduce Kafka when you can demonstrate that JetStream's limits are your bottleneck, not before. Adding Kafka prematurely doubles your messaging infrastructure, your operational burden, your monitoring surface, and your engineering on-call runbook complexity.

---

## 3. Why Does Rule Engine Need to Be a Separate Service?
- At scale, it does earn it's own process boundary for specific measurable reasons. The reasons are stated below:
    - **Resource Profile Mismatch**
    - **Tenant Rule Complexity is Unpredictable**
    - **Independent Versioning and Deployment**
    - **Re-use Surface**
    - **Stateless Design; purely CPU Computation - Cost Effective Autoscaling**
        - No Data Writes → No Need for DB Transactions

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

The rule DSL (`json-rules-engine` schema, custom operators, evaluator logic) evolves separately from state machine execution logic; supports `Extensibility`. Separating them allows:

- Deploying a new rule evaluator version without touching Execution Service.
- A/B testing new rule evaluation logic against a subset of traffic.
- Rolling back Rule Engine independently if a new operator causes bugs.

#### 4. Reuse Surface (Future)

Once extracted, the Rule Engine Service is not tied to Workflow Execution. Future callers:
- Webhook Trigger Service (evaluate should-fire conditions before sending)
- API Gateway plugin (evaluate tenant feature flags)
- Scheduled Jobs Service (evaluate should-run conditions)

#### 5. Stateless Compute = Cheap to Scale

- Rule evaluation is pure function: `(ruleAST, context) → boolean`. No database writes, no state. 
- This makes it the easiest service to horizontally scale. 
- At Scale2 with 100K concurrent users, you may have 2 Execution Service pods and 10 Rule Engine pods — but it's impossible if co-located.


---

## 4. Is there a simplified more accurate architecture, Can you simplify this architecture? YES/NO

### Direct Answer: 
    - YES, but it will make the architecture less maintainable and less scalable. 
    
    - It will work for `Scale-1` but not for `Scale-2`.

#### What is NOT built at Scale1:
- Kafka (introduce at Scale2 for analytics/archival/chat/audit log)
- MongoDB (PostgreSQL handles audit at this scale with partitioning by tenant_id and sharding; if required (hash partitioning))
- New Relic (SigNoz covers it)

#### What is recommended to be built at Scale2:
- Add PgBouncer
- NATS JetStream as backup strategy
- Kafka for analytics/archival/chat/audit log
- MongoDB for chat and audit log
- Add gRPC for inter-service communication between `Workflow Execution` and `Rule Engine`
- Add mTLS and service mesh


---

