import { envSchema } from "./env.validation";

/**
 * Validates environment variables and returns validated configuration
 * @returns Validated environment configuration
 * @throws Error if validation fails
 */
export function validateEnvironment(): Record<string, any> {
  const { error, value } = envSchema.validate(process.env);

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message).join(", ");
    throw new Error(`Environment validation failed: ${errorMessages}`);
  }

  return value;
}

/**
 * Gets a validated environment variable with type safety
 * @param key Environment variable key
 * @param defaultValue Default value if not found
 * @returns Environment variable value
 */
export function getEnvVar<T = string>(key: string, defaultValue?: T): T {
  const validatedEnv = validateEnvironment();
  return validatedEnv[key] ?? defaultValue;
}

/**
 * Checks if the application is running in development mode
 */
export function isDevelopment(): boolean {
  return ["development", "dev"].includes(process.env.NODE_ENV?.toLowerCase() || "");
}

/**
 * Checks if the application is running in production mode
 */
export function isProduction(): boolean {
  return ["production", "prod"].includes(process.env.NODE_ENV?.toLowerCase() || "");
}

/**
 * Checks if the application is running in test mode
 */
export function isTest(): boolean {
  return process.env.NODE_ENV?.toLowerCase() === "test";
}

/**
 * Gets the current stage/environment
 */
export function getCurrentStage(): string {
  return process.env.STAGE || process.env.NODE_ENV || "development";
}
