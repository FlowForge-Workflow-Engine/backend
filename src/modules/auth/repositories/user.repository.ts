import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { User } from "../entities/user.entity";
import { pagination } from "@app/shared/utils/paginaton";
import { BaseRepository, RequestContextService } from "@app/database";
import { DBRoles } from "@app/database/constants/db-roles.enum";

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User) readonly entityRepo: Repository<User>,
    readonly requestContext: RequestContextService
  ) {
    super(entityRepo, requestContext);
  }

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
   * Returns both the current page slice and the full tenant-scoped match count.
   * Uses LEFT JOIN to include roles even if users have none.
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<[User[], number]> - Paginated users with total count
   */
  findByTenantIdWithRoles(
    tenantId: string,
    options: { page: number; limit: number }
  ): Promise<[User[], number]> {
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
      .getManyAndCount();
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

  /**
   * Self-contained RLS-aware lookup for JwtStrategy.validate().
   *
   * Guards run before interceptors — DatabaseContextInterceptor has not fired
   * yet when JwtStrategy queries the user.
   *
   * The CLS QueryRunner does not exist at this point,
   * so this.repo (the contextRepo getter) falls back to entityRepo
   * which is FORCE RLS-bound with no context set → denied.
   *
   * Solution: open a dedicated QR here using tenantId from the JWT payload
   * (already decoded and trusted by this point), set RLS context, query, release.
   *
   * Fully self-contained — no CLS involvement, no interference with the
   * interceptor's QR that will be created immediately after this guard phase.
   */
  async findByIdAndTenantWithRolesForJwtStretegy(id: string, tenantId: string): Promise<User | null> {
    const qr = this.entityRepo.manager.connection.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      await qr.query(`SET LOCAL ROLE ${DBRoles.TENANT_USER}`);
      await qr.query(`SELECT set_config('app.tenant_id', $1::text, true)`, [tenantId]);

      return await qr.manager.getRepository(User).findOne({
        where: { id, tenantId },
        relations: ["userRoles", "userRoles.role"],
      });
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      // commit (or rollback already done above) then release
      // isTransactionActive check needed — rollback above sets it to false
      if (qr.isTransactionActive) await qr.commitTransaction();
      await qr.release();
    }
  }
}
