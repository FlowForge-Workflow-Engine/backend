import * as Joi from "joi";

const optionalString = Joi.string().allow("").optional();
const optionalNumber = Joi.number().empty("").optional();

export const envSchema = Joi.object({
  // =============================================================================
  // ENVIRONMENT CONFIGURATION
  // =============================================================================
  NODE_ENV: Joi.string()
    .valid("development", "dev", "staging", "uat", "production", "prod", "test")
    .required(),
  STAGE: Joi.string().valid("dev", "staging", "uat", "prod", "test").required(),
  PORT: Joi.number().default(3000),

  // =============================================================================
  // DATABASE CONFIGURATION (PostgreSQL)
  // =============================================================================
  DB_HOST: optionalString,
  DB_PORT: Joi.number().empty("").default(5432),
  DB_ADMIN_USER: optionalString,
  DB_ADMIN_PASSWORD: optionalString,
  DATABASE: optionalString,

  DB_APP_USER: optionalString,
  DB_APP_PASSWORD: optionalString,

  // Alternative database URL format (optional)
  DATABASE_URL: optionalString,

  // Session Management (PostgreSQL-based sessions)
  POSTGRES_USER: optionalString,
  POSTGRES_HOST: optionalString,
  POSTGRES_DB: optionalString,
  POSTGRES_PASSWORD: optionalString,
  POSTGRES_PORT: optionalNumber,

  // =============================================================================
  // REDIS CONFIGURATION
  // =============================================================================
  REDIS_URL: Joi.string().default("redis://localhost:6379"),

  // =============================================================================
  // JWT AUTHENTICATION
  // =============================================================================
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default("24h"),
  EXPIRES_IN: Joi.string().default("24h"),
  JWT_REFRESH_EXPIRY_DAYS: Joi.number().default(7),

  // Session Management
  SESSION_SECRET: Joi.string().min(16).required(),

  // =============================================================================
  // RATE LIMITING CONFIGURATION
  // =============================================================================
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(2000),

  // =============================================================================
  // EMAIL CONFIGURATION
  // =============================================================================
  // Primary SMTP Configuration
  EMAIL_USERNAME: Joi.string().required(),
  EMAIL_PASSWORD: Joi.string().required(),
  EMAIL_HOST: Joi.string().required(),
  EMAIL_PORT: Joi.number().required(),

  // Alternative SMTP Configuration (optional)
  // SMTP_HOST: Joi.string().optional(),
  // SMTP_PORT: Joi.number().optional(),
  // SMTP_SECURE: Joi.boolean().default(false),
  // SMTP_USER: Joi.string().optional(),
  // SMTP_PASS: Joi.string().optional(),
  // SMTP_FROM: Joi.string().email().default("noreply@workflow-engine.local"),

  // =============================================================================
  // NATS MESSAGE BROKER
  // =============================================================================
  NATS_URL: Joi.string().default("nats://localhost:4222"),

  // =============================================================================
  // OAUTH CONFIGURATION
  // =============================================================================
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),

  // =============================================================================
  // FRONTEND CONFIGURATION
  // =============================================================================
  FR_BASE_URL: Joi.string().uri().required(),

  // =============================================================================
  // AWS CONFIGURATION
  // =============================================================================
  AWS_REGION: Joi.string().default("us-east-1"),
  AWS_ACCESS_KEY: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  AWS_SECRET_NAME: Joi.string().optional(),
  AWS_PUBLIC_BUCKET_NAME: Joi.string().optional(),

  // =============================================================================
  // APPLICATION CONFIGURATION
  // =============================================================================
  APP_NAME: Joi.string().default("workflow-engine"),

  // =============================================================================
  // DEVELOPMENT/TESTING CONFIGURATION
  // =============================================================================
  LOG_LEVEL: Joi.string().valid("error", "warn", "info", "debug", "verbose").default("info"),

  // =============================================================================
  // NPM PACKAGE METADATA (Auto-populated by npm)
  // =============================================================================
  npm_package_name: Joi.string().optional(),
  npm_package_version: Joi.string().optional(),
}).options({
  // Allow unknown environment variables (for system variables)
  allowUnknown: true,
  // Strip unknown variables from the validated result
  stripUnknown: false,
});
