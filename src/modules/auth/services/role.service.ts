import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { DefaultSystemRoles } from "@app/shared/constants/default-system-roles.enum";
import { Role } from "../entities/role.entity";
import { CreateRoleDto } from "../dto/create-role.dto";
import { RoleRepository } from "../repositories/role.repository";

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(private readonly roleRepository: RoleRepository) {}

  /**
   * Retrieves all roles (system and custom) for a tenant.
   *
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<Role[]> - Array of all roles for the tenant
   */
  async findAll(tenantId: string): Promise<Role[]> {
    // Query all roles belonging to this tenant (includes both system and custom roles)
    return this.roleRepository.findByTenantId(tenantId);
  }

  /**
   * Creates a custom role for a tenant.
   * Prevents name conflicts with system roles and ensures role names are unique per tenant.
   *
   * @param dto - Role creation data (name, description)
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<Role> - The created custom role entity
   * @throws ConflictException - If name conflicts with system roles or already exists in tenant
   */
  async createCustomRole(dto: CreateRoleDto, tenantId: string): Promise<Role> {
    // Step 1: Build set of reserved system role names (case-insensitive comparison)
    const reservedRoleNames = new Set(Object.values(DefaultSystemRoles).map((role) => role.toLowerCase()));

    // Step 2: Validate custom role name doesn't conflict with system roles (prevent shadowing)
    if (reservedRoleNames.has(dto.name.toLowerCase())) {
      throw new ConflictException("System role names cannot be reused for custom roles");
    }

    // Step 3: Check role name is unique within tenant (prevent duplicate role names)
    const existing = await this.roleRepository.findByNameAndTenant(dto.name, tenantId);
    if (existing) throw new ConflictException("Role already exists for this tenant");

    // Step 4: Create custom role entity with isSystemRole=false flag
    const role = this.roleRepository.create({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      isSystemRole: false,
    });

    // Step 5: Persist custom role to database
    const saved = await this.roleRepository.save(role);

    // Step 6: Log creation for operational monitoring
    this.logger.log(`Custom role created: ${saved.id} [tenant=${tenantId}]`);
    return saved;
  }
}
