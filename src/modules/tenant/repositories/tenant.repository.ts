import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { Repository } from "typeorm";
import { Tenant } from "../entities/tenant.entity";

@Injectable()
export class TenantRepository {
  constructor(
    @InjectRepository(Tenant)
    private readonly repo: Repository<Tenant>
  ) {}

  findAll(options: { page?: number; limit?: number } = {}): Promise<Tenant[]> {
    const { page, limit } = options;
    const { skip, take } = pagination(page, limit);

    return this.repo.find({
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
