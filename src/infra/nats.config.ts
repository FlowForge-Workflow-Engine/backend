import { ConfigService } from "@nestjs/config";
import { ConnectionOptions } from "nats";

/**
 * Injection token for the NATS ClientProxy.
 * Use this constant as the injection token in publishers/subscribers:
 *   `@Inject(NATS_CLIENT) private readonly natsClient: ClientProxy`
 */
export const NATS_CLIENT = "NATS_CLIENT";

/**
 * NATS connection options shape.
 * Mirrors `NatsOptions['options']` from @nestjs/microservices without importing it.
 * This prevents a hard dependency on @nestjs/microservices in config code.
 */
export interface NatsConnectionOptions extends ConnectionOptions {
  /** Array of NATS server URLs */
  readonly servers: string[];
  /** Maximum reconnect attempts (-1 = unlimited) */
  readonly maxReconnectAttempts: number;
  /** Reconnect time in milliseconds */
  readonly reconnectTimeWait: number;
  /** Connection name for monitoring */
  readonly name: string;
}

/**
 * Parses `NATS_URL` from ConfigService into typed NATS connection options.
 *
 * @param configService - NestJS ConfigService instance
 * @returns NATS connection options
 * Connection options can be found here:
 * @link https://docs.nats.io/reference/reference#connection-options
 */
export function createNatsOptions(configService: ConfigService): NatsConnectionOptions {
  const natsUrl = configService.get<string>("NATS_URL", "nats://localhost:4222");
  const appName = configService.get<string>("APP_NAME", "workflow-engine");

  return {
    servers: [natsUrl],
    // reconnect options
    reconnect: true,
    maxReconnectAttempts: -1, // unlimited reconnect attempts
    reconnectTimeWait: 2_000, // 2-second backoff between reconnect attempts
    name: appName,

    // keep alive options
    pingInterval: 30_000, // ping every 10 seconds
    maxPingOut: 5, // disconnect after 5 failed pings

    // jitter options: Prevents reconnect storms when many services restart.
    reconnectJitter: 100,
    reconnectJitterTLS: 1000,

    // connection options
    timeout: 5_000, // Fail connect after 5 seconds
    waitOnFirstConnect: true, // waits until a connection succeeds
  };
}

/**
 * Factory configuration for ClientsModule.registerAsync in app.module.ts.
 *
 * Usage in app.module.ts (requires @nestjs/microservices):
 * ```typescript
 * import { Transport } from '@nestjs/microservices';
 * import { NATS_CLIENT, createNatsOptions } from './infra';
 *
 * ClientsModule.registerAsync([{
 *   name: NATS_CLIENT,
 *   useFactory: (configService: ConfigService) => ({
 *     transport: Transport.NATS,
 *     options: createNatsOptions(configService),
 *   }),
 *   inject: [ConfigService],
 * }])
 * ```
 */
export function getNatsClientAsyncOptions(configService: ConfigService): {
  options: NatsConnectionOptions;
} {
  return {
    options: createNatsOptions(configService),
  };
}
