import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { User } from "../entities/user.entity";
import { pagination } from "@app/shared/utils/paginaton";

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>
  ) {}

  findByEmailAndTenant(email: string, tenantId: string): Promise<User | null> {
    return this.repo.findOne({ where: { email, tenantId } });
  }

  findByIdAndTenant(id: string, tenantId: string): Promise<User | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  /**
   * Load user by ID with all assigned roles eagerly.
   * Uses LEFT JOIN to include roles even if user has none.
   * @param id - The user ID to retrieve
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<User | null> - User with userRoles[] populated, or null if not found
   */
  findByIdAndTenantWithRoles(id: string, tenantId: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder("u")
      .leftJoinAndSelect("u.userRoles", "ur")
      .leftJoinAndSelect("ur.role", "r")
      .where("u.id = :id AND u.tenantId = :tenantId", { id, tenantId })
      .getOne();
  }

  findByTenantId(tenantId: string): Promise<User[]> {
    return this.repo.find({ where: { tenantId }, order: { createdAt: "DESC" } });
  }

  /**
   * Returns the tenant-scoped user count for dashboard-style summary views.
   */
  countByTenant(tenantId: string): Promise<number> {
    return this.repo.count({ where: { tenantId } });
  }

  /**
   * Load all users in a tenant with their assigned roles.
   * Uses LEFT JOIN to include roles even if users have none.
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<User[]> - Array of users with userRoles[] populated
   */
  findByTenantIdWithRoles(tenantId: string, options: { page: number; limit: number }): Promise<User[]> {
    const { page, limit } = options;
    const { skip, take } = pagination(page, limit);

    return this.repo
      .createQueryBuilder("u")
      .leftJoinAndSelect("u.userRoles", "ur")
      .leftJoinAndSelect("ur.role", "r")
      .where("u.tenantId = :tenantId", { tenantId })
      .orderBy("u.createdAt", "DESC")
      .skip(skip)
      .take(take)
      .getMany();
  }

  findManyByIds(ids: string[], tenantId: string): Promise<User[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids), tenantId } });
  }

  /**
   * Load user with all roles eagerly — used during JWT construction.
   */
  findByIdWithRoles(id: string, tenantId: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder("u")
      .leftJoinAndSelect("u.userRoles", "ur")
      .leftJoinAndSelect("ur.role", "r")
      .where("u.id = :id AND u.tenantId = :tenantId", { id, tenantId })
      .getOne();
  }

  create(data: Partial<User>): User {
    return this.repo.create(data);
  }

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }
}
