/**
 * Returns the current date-time as an ISO 8601 string.
 * @returns ISO timestamp string e.g. "2026-03-04T12:00:00.000Z"
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Converts a Date object to an ISO 8601 string.
 * @param date - The date to convert
 * @returns ISO timestamp string
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

