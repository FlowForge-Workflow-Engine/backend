import { Test, TestingModule } from "@nestjs/testing";
import { ClassSerializerInterceptor, INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { MailerService } from "@nestjs-modules/mailer";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { mockMailerService } from "./mocks";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { createNatsOptions, RedisService } from "../src/infra";
import { ConfigService } from "@nestjs/config";

// ─── App lifecycle ────────────────────────────────────────────────────────────

beforeAll(async () => {
  const app = await initializeApp();
  global.app = app;
});

beforeEach(async () => {
  await resetDatabase();
});

afterEach(async () => {
  // await resetDatabase();
});

afterAll(async () => {
  if (global.app) {
    // Close microservices first to prevent hanging connections
    await global.app.close();
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function initializeApp(): Promise<INestApplication> {
  console.log("\nInitializing app...");

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailerService)
    .useValue(mockMailerService)
    .compile();

  const app: INestApplication = moduleFixture.createNestApplication();

  // Apply the same configuration as main.ts
  app.setGlobalPrefix("/api");
  app.enableVersioning({
    defaultVersion: "1",
    type: VersioningType.URI,
  });

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalPipes(new ValidationPipe({ transform: true, stopAtFirstError: true }));
  app.useLogger(false); // suppress NestJS logs during tests

  const configService = app.get<ConfigService>(ConfigService);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.NATS,
    options: createNatsOptions(configService),
  });

  await app.startAllMicroservices();

  await app.init();
  return app;
}

async function resetDatabase(): Promise<void> {
  if (!global.app) throw new Error("App not initialized — setup.ts beforeAll may have failed");
  console.log("\nResetting database...");

  // ✅ Flush Redis first
  const redis = global.app.get<RedisService>(RedisService); // or whatever your token is
  await redis.getClient().flushdb(); // or redis.flushall() if you have direct ioredis access

  const dataSource = global.app.get<DataSource>(DataSource);
  const entities = dataSource.entityMetadatas;

  // Get all table names in reverse order (to respect FK constraints)
  const tableNames = entities.map((entity) => entity.tableName).reverse();

  // Truncate all tables with CASCADE to handle FK constraints
  for (const tableName of tableNames) {
    // if (tableName === "audit_logs") continue;

    await dataSource.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
    // try {
    //   await dataSource.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
    // } catch (error) {
    //   console.warn(`Failed to truncate table ${tableName}:`, error.message);
    //   // Silently ignore if table doesn't exist or other truncate errors
    //   // This can happen if migrations haven't run yet
    // }
  }
}
