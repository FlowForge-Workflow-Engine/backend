import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  HealthCheck,
  HealthCheckService,
  MicroserviceHealthIndicator,
  TypeOrmHealthIndicator,
} from "@nestjs/terminus";
import { Transport } from "@nestjs/microservices";
import { Public } from "@app/shared/decorators/public.decorator";

/**
 * Health check controller.
 * Both endpoints are @Public() — skips global JwtAuthGuard.
 *
 * GET /health       → { status, details: { db, redis, nats } }
 * GET /health/ready → 200 when the service is ready to serve traffic
 */
@Controller("health")
@ApiTags("Health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly microservice: MicroserviceHealthIndicator,
    private readonly configService: ConfigService
  ) {}

  /**
   * Liveness probe — checks database, Redis, and NATS connectivity.
   * Returns 200 when all indicators are healthy, 503 when any fail.
   */
  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: "Liveness probe: db, redis, nats" })
  async check(): Promise<unknown> {
    const redisUrl = this.configService.get<string>("REDIS_URL", "redis://localhost:6379");
    const parsedRedis = new URL(redisUrl);
    const natsUrl = this.configService.get<string>("NATS_URL", "nats://localhost:4222");

    return this.health.check([
      () => this.db.pingCheck("db"),
      () =>
        this.microservice.pingCheck("redis", {
          transport: Transport.REDIS,
          options: {
            host: parsedRedis.hostname || "localhost",
            port: parsedRedis.port ? parseInt(parsedRedis.port, 10) : 6379,
          },
        }),
      () =>
        this.microservice.pingCheck("nats", {
          transport: Transport.NATS,
          options: { servers: [natsUrl] },
        }),
    ]);
  }

  /**
   * Readiness probe — returns 200 when service is ready to serve traffic.
   */
  @Get("ready")
  @Public()
  @ApiOperation({ summary: "Readiness probe" })
  async ready(): Promise<{ status: string }> {
    return { status: "ok" };
  }
}
