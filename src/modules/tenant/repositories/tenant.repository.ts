import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { Repository } from "typeorm";
import { Tenant } from "../entities/tenant.entity";
import { BaseRepository, RequestContextService } from "@app/database";
import { DBRoles } from "@app/database/constants/db-roles.enum";
import { DBVariables } from "@app/database/constants/db-variables.enum";

@Injectable()
export class TenantRepository extends BaseRepository<Tenant> {
  constructor(
    @InjectRepository(Tenant) readonly entityRepo: Repository<Tenant>,
    readonly requestContext: RequestContextService
  ) {
    super(entityRepo, requestContext);
  }

  findAll(options: { page?: number; limit?: number } = {}): Promise<[Tenant[], number]> {
    const { page, limit } = options;
    const { skip, take } = pagination(page, limit);

    // ✅ Bypass RLS for superadmin
    this.repo.query(`SELECT set_config('${DBVariables.APP_ROLE}', $1::text, true)`, [DBRoles.SUPERADMIN]);

    return this.repo.findAndCount({
      order: { createdAt: "DESC" },
      skip,
      take,
    });
  }

  findById(id: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { id } });
  }

  findBySlug(slug: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    const qb = this.repo.createQueryBuilder("t").where("t.slug = :slug", { slug });

    if (excludeId) {
      qb.andWhere("t.id != :excludeId", { excludeId });
    }

    const count = await qb.getCount();
    return count > 0;
  }

  create(data: Partial<Tenant>): Tenant {
    return this.repo.create(data);
  }

  save(tenant: Tenant): Promise<Tenant> {
    return this.repo.save(tenant);
  }
}
