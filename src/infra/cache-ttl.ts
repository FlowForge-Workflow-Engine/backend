/**
 * Redis TTL constants (in seconds).
 */
export const CacheTTL = {
  /** Short-lived data — JWT user validation, feature flags */
  SHORT: 60, // 1 minute

  /** Standard operational data — tenant detail, user summary */
  MEDIUM: 300, // 5 minutes

  /** Long-lived read-heavy data — definitions, states, transitions */
  LONG: 3600, // 1 hour

  /** Immutable snapshots — published version snapshots never change */
  IMMUTABLE: 86_400, // 24 hours

  /** Idempotency keys — enough window to prevent duplicate transitions */
  IDEMPOTENCY: 300, // 5 minutes

  /** Rate limit window — matches the rolling minute window */
  RATE_LIMIT: 60, // 1 minute
} as const;
