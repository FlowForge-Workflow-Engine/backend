# FlowForge — Event Throughput Derivation & Messaging Stack Recommendation

**Scope:** Bottom-up derivation of NATS and Kafka event rates for Scale1 and Scale2,  
comparison against infrastructure limits, and a recommendation on JetStream vs Kafka.

---

## Correction First

The figure `~100K/sec` used in the previous document was an unsubstantiated rough estimate.  
The actual derived numbers are significantly lower. This document replaces that figure with a proper model.

---

## Assumptions and Methodology

All numbers are derived bottom-up from the system's own parameters, not top-down guesses.

### Input Parameters

| Parameter | Value | Source |
|---|---|---|
| Scale1 concurrent users | 10,000 | Architecture spec |
| Scale2 concurrent users | 100,000 | Architecture spec |
| User think time (normal) | 45 seconds | Enterprise B2B tool baseline — users read, think, decide |
| User think time (peak) | 15 seconds | Morning approval rush — "quick approve" behaviour |
| Write ratio (normal) | 20% of actions | Architecture doc §12 — "80% reads / 20% writes" |
| Write ratio (peak) | 40% of actions | Architecture doc — "up to 40% writes during morning approval rushes" |
| Transition : instance-create split | 70% : 30% of writes | Most actions are transitions on existing instances |
| NATS events per transition | 3.2 (avg) | Derived below |
| Kafka events per transition | 3.0 | Derived below |
| Chat active users | 5% of concurrent | Conservative estimate for support chat |
| Chat message rate | 1 msg/minute/active user | Typical support conversation cadence |
| NATS chat fanout | 4× per message | Avg subscribers per conversation across pods |

---

### Events Per Transition — Derivation

Every `POST /transitions` triggers these events from the `NatsEvents` enum:

```
WORKFLOW_TRANSITION_COMPLETED        → 1 NATS  + 1 Kafka (audit + analytics)
NOTIFICATION_SEND_EMAIL or WEBHOOK   → 1 NATS  + 1 Kafka (notification durable consumer)
Audit shadow sync (internal)         → 1 NATS  (subscriber writes to audit store)
WORKFLOW_INSTANCE_COMPLETED          → ~0.15 NATS (1 in ~7 transitions ends an instance)
WORKFLOW_INSTANCE_CANCELLED          → ~0.02 NATS (rare)
```

**Per-transition totals:**

| Bus | Events/transition | Reason |
|---|---|---|
| NATS | 3.2 (avg) | 3 guaranteed + ~0.17 probabilistic terminal events |
| Kafka | 3.0 | Audit log + analytics + notification durable write |

---

## Derived Event Rates

### Scale1 — 10,000 Concurrent Users

| Step | Normal (avg) | Peak (morning rush) |
|---|---|---|
| Total action rate | 222 req/s | 667 req/s |
| Write rate | 44 req/s | 267 req/s |
| Transitions/sec | 31/s | 187/s |
| Instance creates/sec | 13/s | 80/s |
| **NATS — workflow domain** | **120 msg/s** | **717 msg/s** |
| Chat active users | 500 | 500 |
| Chat message rate | 8.3 msg/s | 8.3 msg/s |
| NATS chat fanout (4×) | 33 msg/s | 33 msg/s |
| NATS presence/shadow events | ~0.17 msg/s | ~0.17 msg/s |
| **NATS TOTAL** | **153 msg/s** | **~750 msg/s** |
| **Kafka — workflow domain** | **120 events/s** | **720 events/s** |
| Kafka — chat history | 8.3 events/s | 8.3 events/s |
| **Kafka TOTAL** | **~128 events/s** | **~730 events/s** |

**Scale1 daily volumes (8h peak + 16h at 30% of peak):**

| Bus | Messages/day | 30-day retention volume |
|---|---|---|
| NATS | ~34.6M | N/A (not stored long-term) |
| Kafka | ~33.6M | ~1.0 billion events |

---

### Scale2 — 100,000 Concurrent Users

| Step | Normal (avg) | Peak (morning rush) |
|---|---|---|
| Total action rate | 2,222 req/s | 6,667 req/s |
| Write rate | 444 req/s | 2,667 req/s |
| Transitions/sec | 311/s | 1,867/s |
| Instance creates/sec | 133/s | 800/s |
| **NATS — workflow domain** | **1,196 msg/s** | **7,173 msg/s** |
| Chat active users | 5,000 | 5,000 |
| Chat message rate | 83 msg/s | 83 msg/s |
| NATS chat fanout (4×) | 333 msg/s | 333 msg/s |
| NATS presence/shadow events | ~1.7 msg/s | ~1.7 msg/s |
| **NATS TOTAL** | **~1,531 msg/s** | **~7,508 msg/s** |
| **Kafka — workflow domain** | **1,200 events/s** | **7,200 events/s** |
| Kafka — chat history | 83 events/s | 83 events/s |
| **Kafka TOTAL** | **~1,283 events/s** | **~7,283 events/s** |

**Scale2 daily volumes:**

| Bus | Messages/day | 30-day retention volume |
|---|---|---|
| NATS | ~346M | N/A |
| Kafka | ~335M | ~10.1 billion events |

---

## Infrastructure Limits — Realistic Production Numbers

These are based on published benchmarks and well-documented real-world deployments, not theoretical maximums.

### NATS JetStream

| Configuration | Throughput | Notes |
|---|---|---|
| Core NATS (fire-and-forget) | 10M–30M msg/sec | No durability, no acks. Pure pub/sub. |
| JetStream, R=1, file storage | 1M–5M msg/sec | Single-copy durable, NVMe SSD |
| JetStream, R=3, acknowledged | **50K–200K msg/sec** | Production-grade: 3-node cluster, acks required, file-backed |
| JetStream, R=3, memory storage | 200K–500K msg/sec | For latency-sensitive ephemeral streams |

**Practical ceiling for this system:** JetStream R=3 with acknowledgements at **~100K–150K msg/sec** sustained on 3 × 4-core nodes with NVMe SSDs. This is the conservative production number.

### Apache Kafka

| Configuration | Throughput | Notes |
|---|---|---|
| Single partition | 50K–100K events/sec | Throughput ceiling per partition |
| 3 brokers, 12 partitions, acks=1 | 1M–2M events/sec | High throughput, risk of data loss on broker crash |
| 3 brokers, acks=all, min.insync=2 | **200K–500K events/sec** | Production-grade durability |
| AWS MSK m5.large, 3 brokers | **~150K–300K events/sec** | Real-world managed Kafka (typical enterprise deployment) |
| AWS MSK m5.4xlarge, 6 brokers | ~1M–2M events/sec | Large-scale deployment |

---

## The Comparison That Matters

| Metric | Scale1 Peak | Scale2 Peak | JetStream R=3 Limit | Kafka (acks=all) Limit |
|---|---|---|---|---|
| NATS messages/sec | **~750** | **~7,500** | ~100,000–200,000 | N/A |
| Kafka events/sec | **~730** | **~7,300** | N/A | ~200,000–500,000 |
| % of JetStream ceiling used | **~0.5–0.75%** | **~3.75–7.5%** | 100% | — |
| % of Kafka ceiling used | **~0.15–0.25%** | **~1.5–2.4%** | — | 100% |
| Headroom (JetStream) | **133× surplus** | **13× surplus** | — | — |
| Headroom (Kafka) | **>200× surplus** | **>20× surplus** | — | — |

**Both Scale1 and Scale2 are orders of magnitude below JetStream's practical ceiling.**  
Throughput is not the reason to choose Kafka at either scale.

---

## What Would Actually Push You Past JetStream?

For throughput alone to make JetStream insufficient, you would need:

| Scenario | Approximate Concurrent Users | Event Rate |
|---|---|---|
| Hit JetStream R=3 practical ceiling | ~1.3M concurrent users | ~100K peak events/sec |
| Hit Kafka acks=all practical ceiling | ~6.5M concurrent users | ~500K peak events/sec |

That is a **Scale3** problem — far beyond the stated system targets. At this system's scale targets, neither platform is throughput-constrained.

---

## Then Why Would You Ever Add Kafka? — The Real Reasons

Since throughput eliminates itself as a reason at both scales, these are the **actual valid reasons** to add Kafka, assessed per scale:

| Reason | Scale1 | Scale2 | Why |
|---|---|---|---|
| **Long-term audit retention (7-year HIPAA)** | ❌ Not needed | ✅ Needed | JetStream retention is disk-bound with no archival tier. Kafka (MSK) supports tiered storage to S3 — cost-effective for billions of events over years. |
| **Kafka Connect ecosystem** (MongoDB sink, S3 sink, Redshift, Elasticsearch) | ❌ Too early | ✅ Needed | At Scale2 with an Analytics Service, building custom Kafka consumers is replaced by managed connectors. No equivalent in JetStream. |
| **Stream processing** (Kafka Streams, ksqlDB, Flink) | ❌ Overkill | ✅ Useful | Real-time tenant usage metering, SLA breach detection, aggregated dashboards across 10K tenants becomes a stream processing problem. |
| **Cross-region replication** (MirrorMaker2) | ❌ Not yet | ✅ Needed | At Scale2 with multi-region active-active deployment, Kafka MirrorMaker2 is production-battle-tested. JetStream geo-clustering is experimental. |
| **Log compaction** (keep latest per key) | ❌ | ✅ | Useful for materialised views — e.g. "current state of every workflow instance" as a compacted topic. |
| **Schema Registry** (Confluent / AWS Glue) | ❌ | ✅ | At 10K tenants with 10+ consumer services, enforced schema evolution contracts prevent silent breaking changes. |
| **Throughput** | ❌ Not the reason | ❌ Not the reason | Neither scale hits JetStream's ceiling. Do not use this as a justification. |

---

## Recommendation by Scale

### Scale1 — Use NATS JetStream Only

**Reasoning:**
- Peak event rate of ~750 events/sec is 0.5% of JetStream's practical ceiling.
- JetStream covers: at-least-once delivery, DLQ, consumer acknowledgements, durable subscriptions, replay.
- All four stated Kafka uses in the diagram (audit, analytics, notifications DLQ, chat history) are handled by JetStream streams.
- Adding Kafka at Scale1 doubles your messaging infrastructure, your on-call runbook, your operational complexity, and your cloud cost — for zero throughput benefit.

**JetStream stream configuration for Scale1:**

| Stream | Subjects | Retention | Replication | Purpose |
|---|---|---|---|---|
| `AUDIT` | `audit.>` | 365 days | R=3 | Durable audit writes |
| `NOTIFICATIONS` | `notification.>` | 7 days | R=3 | Email/webhook delivery with DLQ |
| `CHAT_HISTORY` | `chat.message.>` | 90 days | R=3 | Durable chat history |
| `WORKFLOW_EVENTS` | `workflow-execution.>` | 30 days | R=3 | Replay, analytics shadow |
| `DOMAIN_EVENTS` | `auth.>`, `tenant.>` | 30 days | R=2 | Shadow model sync |

---

### Scale2 — NATS JetStream + Kafka (for specific purposes)

**Reasoning:**
- Peak event rate of ~7,500 events/sec is still only ~7.5% of JetStream's ceiling. Throughput is still not the driver.
- Kafka becomes justified at Scale2 for: 7-year HIPAA retention via S3 tiered storage, Kafka Connect sinks for the Analytics Service, stream processing for tenant usage metering, and production-grade cross-region replication.
- Keep NATS JetStream for all real-time service messaging. Add Kafka only for the long-term event store.

**Kafka topics at Scale2:**

| Topic | Partitions | Retention | Purpose |
|---|---|---|---|
| `workflow.audit.events` | 30 (by tenant_id) | 7 years (S3 tiered) | HIPAA-compliant audit archive |
| `workflow.analytics` | 20 | 90 days | Kafka Streams / Flink input |
| `chat.messages` | 20 | 365 days | Long-term chat archive |
| `notifications.dlq` | 5 | 14 days | Guaranteed reprocessing |
| `tenant.usage.metering` | 10 | 90 days | Billing pipeline input |

---

### When to Add Kafka — Decision Trigger

Do not add Kafka based on anticipated load. Add it when one of these conditions is true in production:

| Trigger | Condition |
|---|---|
| Audit retention | Compliance team requires >1-year immutable retention. JetStream's disk cost becomes prohibitive. |
| Analytics pipeline | Analytics Service needs Kafka Connect sink to data warehouse (Redshift, BigQuery). |
| Cross-region | Second region deployed. MirrorMaker2 needed for event replication. |
| Stream processing | Real-time aggregations (usage metering, SLA breach detection) require Kafka Streams or Flink. |
| **Never:** Throughput | JetStream's ceiling is not your bottleneck at either stated scale. |

---

## Summary

| | Scale1 | Scale2 |
|---|---|---|
| **Peak NATS rate** | ~750 msg/sec | ~7,500 msg/sec |
| **Peak Kafka/stream rate** | ~730 events/sec | ~7,300 events/sec |
| **JetStream R=3 ceiling** | ~100K–200K msg/sec | ~100K–200K msg/sec |
| **Headroom on JetStream** | **133×** | **13×** |
| **Throughput justifies Kafka?** | ❌ No | ❌ No |
| **Ecosystem/retention justifies Kafka?** | ❌ No | ✅ Yes (specific use cases) |
| **Recommended stack** | **NATS + JetStream only** | **NATS + JetStream + Kafka (analytics/archival)** |
| **Previous document's "~100K/sec" figure** | ❌ Incorrect — overestimated by ~133× | ❌ Incorrect — overestimated by ~13× |

The previous `~100K/sec` figure was a rough top-down estimate with no derivation — it was wrong by two orders of magnitude at Scale1. The correct approach is always to model from user behaviour upward, not from infrastructure limits downward.

---

*Derived from: architecture doc §12 (read/write ratios, operation frequency table), `nats-events.enum.ts` (event count per transition), diagram Notes (NATS/Kafka decision rationale). Infrastructure limits sourced from NATS benchmark documentation, Confluent engineering blog, and AWS MSK performance guides.*
