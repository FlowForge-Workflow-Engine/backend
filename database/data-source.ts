import * as dotenv from "dotenv";
import { join } from "path";
import { DataSource } from "typeorm";

/**
 * TypeORM CLI DataSource for running and generating migrations.
 *
 * This file is used only by the TypeORM CLI (typeorm migration:run, etc.).
 * The application uses TypeOrmModule.forRootAsync (via src/infra/typeorm.config.ts) instead.
 *
 * Usage:
 *   bun run typeorm -- migration:run -d database/data-source.ts
 *   bun run typeorm -- migration:generate database/migrations/MyMigration -d database/data-source.ts
 *   bun run typeorm -- migration:revert -d database/data-source.ts
 */

// Load .env.stage.dev by default; override with STAGE env var
const stage = process.env.STAGE ?? "dev";
dotenv.config({ path: join(process.cwd(), `.env.stage.${stage}`) });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    `DATABASE_URL is not defined. Make sure .env.stage.${stage} exists and contains DATABASE_URL.`,
  );
}

export default new DataSource({
  type: "postgres",
  url: databaseUrl,
  entities: [join(__dirname, "..", "src", "**", "*.entity.{ts,js}")],
  migrations: [join(__dirname, "migrations", "*.{ts,js}")],
  migrationsTableName: "typeorm_migrations",
  synchronize: false,
  logging: ["migration", "error"],
});

