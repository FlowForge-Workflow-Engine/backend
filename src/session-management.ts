import { NestExpressApplication } from "@nestjs/platform-express";
import * as session from "express-session";
import PgSession from "connect-pg-simple";
import { Pool } from "pg";

/**
 * Configures session management for a NestJS application using PostgreSQL as the session store.
 *
 * This function sets up a session middleware with the following features:
 * - Utilizes a PostgreSQL connection pool for storing session data.
 * - Configures session parameters such as the secret, cookie settings, and session table name.
 * - Automatically prunes expired sessions every hour to maintain the session table.
 *
 * @param app - An instance of the NestExpressApplication, representing the NestJS application.
 *
 * @returns {void} This function does not return a value.
 *
 * @throws {Error} Throws an error if the PostgreSQL connection cannot be established.
 *
 * @example
 * import { NestExpressApplication } from '@nestjs/platform-express';
 *
 * const app: NestExpressApplication = ...; // Initialize your NestJS application
 * expressSession(app);
 *
 * @remarks
 * Ensure that the following environment variables are set:
 * - POSTGRES_USER: Database user for PostgreSQL connection.
 * - POSTGRES_HOST: Host address of the PostgreSQL database.
 * - POSTGRES_DB: Name of the PostgreSQL database.
 * - POSTGRES_PASSWORD: Password for the PostgreSQL user.
 * - POSTGRES_PORT: Port number for PostgreSQL connection.
 * - SESSION_SECRET: A strong secret key for session encryption (optional, defaults to "strongSecretKey").
 *
 * This middleware should be called before any route handling in the NestJS application.
 */
const expressSession = (app: NestExpressApplication) => {
  // Configure PostgreSQL connection pool
  const pgPool = new Pool({
    user: process.env.POSTGRES_USER, // Database user
    host: process.env.POSTGRES_HOST, // Database host
    database: process.env.POSTGRES_DB, // Database name
    password: process.env.POSTGRES_PASSWORD, // Database password
    port: Number(process.env.POSTGRES_PORT), // Database port
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false, // Use SSL in production
  });

  app.use(
    session({
      store: new (PgSession(session))({
        pool: pgPool, // Reuse the PostgreSQL pool for session storage
        tableName: "user_sessions", // Custom table name for sessions
        pruneSessionInterval: 60 * 60, // Automatically prune expired sessions every hour
      }),
      secret: process.env.SESSION_SECRET || "strongSecretKey", // Strong, environment-specific secret
      name: "sessionId", // Custom cookie name
      resave: false, // Avoid unnecessary session resaves
      saveUninitialized: false, // Save sessions only when they are modified
      cookie: {
        httpOnly: true, // Prevent JavaScript access to the cookie
        secure: process.env.NODE_ENV === "production", // Enforce HTTPS in production
        sameSite: "strict", // Restrict the cookie to same-site requests for CSRF protection
        maxAge: 3600000, // 1-hour session expiration in milliseconds
      },
    })
  );
};

export { expressSession };
