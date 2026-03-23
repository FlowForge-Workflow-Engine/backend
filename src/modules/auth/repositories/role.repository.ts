import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Role } from "../entities/role.entity";
import { BaseRepository, RequestContextService } from "@app/database";

@Injectable()
export class RoleRepository extends BaseRepository<Role> {
  constructor(
    @InjectRepository(Role) readonly entityRepo: Repository<Role>,
    readonly requestContext: RequestContextService
  ) {
    super(entityRepo, requestContext);
  }

  findByTenantId(tenantId: string): Promise<Role[]> {
    return this.repo.find({ where: { tenantId }, order: { name: "ASC" } });
  }

  findByNameAndTenant(name: string, tenantId: string): Promise<Role | null> {
    return this.repo.findOne({ where: { name, tenantId } });
  }

  findByIdAndTenant(id: string, tenantId: string): Promise<Role | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  findByIds(ids: string[], tenantId: string): Promise<Role[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids), tenantId } });
  }

  findByNames(names: string[], tenantId: string): Promise<Role[]> {
    if (!names.length) return Promise.resolve([]);
    return this.repo.find({ where: { name: In(names), tenantId } });
  }

  create(data: Partial<Role>): Role {
    return this.repo.create(data);
  }

  save(role: Role): Promise<Role> {
    return this.repo.save(role);
  }

  saveMany(roles: Role[]): Promise<Role[]> {
    return this.repo.save(roles);
  }
}
