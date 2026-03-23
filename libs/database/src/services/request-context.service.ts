import { Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { QueryRunner } from "typeorm";

@Injectable()
export class RequestContextService {
  private readonly QUERY_RUNNER_KEY = "queryRunner";
  private readonly TENANT_ID_KEY = "tenantId";

  constructor(private readonly cls: ClsService) {}

  setQueryRunner(queryRunner: QueryRunner) {
    this.cls.set(this.QUERY_RUNNER_KEY, queryRunner);
  }

  getQueryRunner(): QueryRunner | undefined {
    return this.cls.get(this.QUERY_RUNNER_KEY);
  }

  setTenantId(tenantId: string | null) {
    this.cls.set(this.TENANT_ID_KEY, tenantId);
  }

  getTenantId(): string | null {
    return this.cls.get(this.TENANT_ID_KEY);
  }
}
