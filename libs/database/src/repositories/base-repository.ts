import { Injectable, Logger } from "@nestjs/common";
import { Repository, ObjectLiteral } from "typeorm";
import { RequestContextService } from "../services/request-context.service";

export abstract class BaseRepository<T extends ObjectLiteral> {
  private readonly logger = new Logger(BaseRepository.name);

  constructor(
    protected readonly entityRepo: Repository<T>,
    protected readonly requestContext: RequestContextService
  ) {}

  /**
   * Always use this instead of this.entityRepo directly.
   *
   * If a request-scoped QueryRunner exists in CLS (set by the interceptor),
   * returns a Repository bound to that runner's manager — meaning all queries
   *
   * run on the same connection that has the RLS role and config set.
   *
   * Falls back to the default repo only for background jobs / CLI scripts
   * that run outside of a request context.
   */
  protected get repo(): Repository<T> {
    const qr = this.requestContext.getQueryRunner();
    // this.logger.debug(`QR in CLS: ${qr ? "yes" : "no"}${qr && !qr.isReleased ? " (active)" : ""}`);

    if (qr && !qr.isReleased) return qr.manager.getRepository(this.entityRepo.target);

    // If this logs during an HTTP request, the interceptor is misconfigured
    this.logger.warn(`No QR in CLS for ${this.entityRepo.target} — using fallback`);

    // Fallback: background jobs, CLI scripts, health checks — no request context
    return this.entityRepo;
  }
}
