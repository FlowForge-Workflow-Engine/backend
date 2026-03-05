import { v4 as uuidv4, validate as uuidValidate } from "uuid";

/**
 * Generates a new UUID v4.
 * @returns A UUID v4 string
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Validates whether a string is a valid UUID.
 * @param value - String to validate
 * @returns true if the string is a valid UUID
 */
export function isValidUUID(value: string): boolean {
  return uuidValidate(value);
}

