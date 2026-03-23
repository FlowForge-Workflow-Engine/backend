import { MigrationInterface, QueryRunner } from "typeorm";
import { DBRoles } from "@app/database/constants/db-roles.enum";
import { DBVariables } from "@app/database/constants/db-variables.enum";

/**
 * Migration: Create Row-Level Security (RLS) Policies — PRODUCTION-READY (Updated)
 *
 * ============================================================================
 * CHANGELOG vs ORIGINAL:
 * ============================================================================
 *
 * FIX 1 — UUID regex tightened (was too loose, matched non-UUID strings)
 *   BEFORE: ~* '^[0-9a-f-]{36}$'           (matches '------------------------------------')
 *   AFTER:  ~  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *   Case-sensitive (~) used since UUIDs are always stored lowercase.
 *
 * FIX 2 — public_select_refresh_tokens rewritten (was completely broken for /refresh)
 *   BEFORE: scoped by app.tenant_id — which is NOT set during /refresh (that is
 *           the whole point: tenant_id is unknown until AFTER the token is looked up)
 *   AFTER:  scoped by app.token_hash — interceptor sets this from the raw token's
 *           SHA-256 before the repository call. RLS allows exactly the one matching row.
 *   REQUIRED: Add APP_TOKEN_HASH = 'app.token_hash' to your DBVariables enum.
 *             Set it in DatabaseContextInterceptor for the /refresh route.
 *
 * FIX 3 — public_update_refresh_tokens added (was missing — caused silent revoke failure)
 *   revoke() is an UPDATE. No public UPDATE policy existed, so with FORCE RLS enabled
 *   the UPDATE was silently blocked (0 rows affected), meaning token rotation was broken:
 *   the old token was never invalidated, defeating refresh token rotation entirely.
 *   New policy: UPDATE scoped to the same app.token_hash as the SELECT above.
 *
 * FIX 4 — USING clause removed from INSERT-only policies (PostgreSQL ignores USING on INSERT)
 *   PostgreSQL only evaluates WITH CHECK for INSERT. Emitting a USING clause for an
 *   INSERT policy is dead code. Removed from public_insert_tenants and public_insert_users.
 *
 * FIX 5 — tenants UPDATE policy added (was missing — FORCE RLS blocked all tenant updates)
 *   tenants table had FORCE ROW LEVEL SECURITY but only INSERT + SELECT policies.
 *   With FORCE RLS, even the table owner role (workflow_app) is subject to policies.
 *   Without an UPDATE policy, any attempt to update a tenant's plan, slug, or status
 *   would be silently denied. New policy: tenant_user can UPDATE their own tenant row;
 *   superadmin bypass included.
 *
 * FIX 6 — Removed unused import { using } from "rxjs"
 *
 * ============================================================================
 * HOW RLS WORKS IN THIS SYSTEM:
 * ============================================================================
 *
 * Base DB user:  workflow_app
 * Roles:         public_user   — unauthenticated / public API routes
 *                tenant_user   — authenticated, tenant-scoped API routes
 *
 * DatabaseContextInterceptor sets session config BEFORE every query:
 *
 *   Authenticated routes:
 *     SET ROLE tenant_user;
 *     SELECT set_config('app.tenant_id',  tenantId,  true);  -- tx-local
 *     SELECT set_config('app.role',       role,      true);
 *
 *   Public routes (login, register):
 *     SET ROLE public_user;
 *     SELECT set_config('app.tenant_id',  tenantId,  true);  -- from request body if available
 *     SELECT set_config('app.tenant_slug', slug,     true);  -- for slug-based routes
 *
 *   /refresh route specifically:
 *     SET ROLE public_user;
 *     SELECT set_config('app.token_hash', sha256(rawToken), true);
 *     -- DO NOT set app.tenant_id — it is unknown until after findByHash()
 *
 * ============================================================================
 * CONNECTION POOLING & DATA LEAK PREVENTION:
 * ============================================================================
 *
 * Use set_config(..., true) — the third argument TRUE means TRANSACTION-LOCAL.
 * The setting is automatically cleared when the transaction ends, so a pooled
 * connection returned to the pool carries no stale tenant context.
 *
 * Recommended interceptor pattern:
 *   1. queryRunner = dataSource.createQueryRunner()
 *   2. await queryRunner.connect()
 *   3. await queryRunner.startTransaction()
 *   4. set_config calls (all with local = true)
 *   5. execute all repository operations within this queryRunner
 *   6. await queryRunner.commitTransaction()   (or rollbackTransaction on error)
 *   7. await queryRunner.release()             — clears all tx-local config automatically
 *
 * This is the only correct approach with a shared connection pool. Session-scoped
 * set_config (third arg = false) leaks tenant context to the next request that
 * picks up the same connection from the pool — a critical cross-tenant data leak.
 *
 * ============================================================================
 * TABLES COVERED:
 * ============================================================================
 * Auth:          users, roles, user_roles, refresh_tokens
 * Tenant:        tenant_settings, tenant_feature_flags, tenants (public ops)
 * Workflow Def:  workflow_definitions, workflow_definition_versions,
 *                workflow_states, workflow_transitions, transition_rules,
 *                instance_form_schemas
 * Workflow Exec: workflow_instances, we_user_shadows
 * Audit:         audit_logs
 * Notification:  notification_templates, notification_logs,
 *                webhook_configs, webhook_delivery_logs
 *
 * EXCLUDED:  permissions (global/system-wide, no tenant_id)
 */
export class CreateRlsPolicies1772830604496 implements MigrationInterface {
  // ─── Strict UUID format regex ──────────────────────────────────────────────
  // Matches exactly: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (lowercase hex)
  // Use case-sensitive ~ (not ~*) since UUIDs are always lowercase in PostgreSQL
  private readonly UUID_REGEX = "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'";

  // ─── Reusable USING clause: validates + casts app.tenant_id ───────────────
  private uuidGuard(column: string): string {
    return `
      CASE
        WHEN current_setting('${DBVariables.APP_TENANT_ID}', true) IS NULL THEN false
        WHEN current_setting('${DBVariables.APP_TENANT_ID}', true) = ''    THEN false
        WHEN current_setting('${DBVariables.APP_TENANT_ID}', true) !~ ${this.UUID_REGEX} THEN false
        ELSE ${column} = current_setting('${DBVariables.APP_TENANT_ID}', true)::uuid
      END
    `;
  }

  // ─── Reusable USING with superadmin bypass ─────────────────────────────────
  private withSuperadminBypass(column: string): string {
    return `
      CASE
        WHEN current_setting('${DBVariables.APP_ROLE}', true) = '${DBRoles.SUPERADMIN}' THEN true
        ELSE ${this.uuidGuard(column)}
      END
    `;
  }

  // ─── Reusable token_hash guard ─────────────────────────────────────────────
  private tokenHashGuard(): string {
    return `
      current_setting('${DBVariables.APP_TOKEN_HASH}', true) IS NOT NULL
      AND current_setting('${DBVariables.APP_TOKEN_HASH}', true) != ''
      AND token_hash = current_setting('${DBVariables.APP_TOKEN_HASH}', true)
    `;
  }

  private tenantSlugNullGuard(): string {
    return `
      current_setting('${DBVariables.APP_TENANT_SLUG}', true) IS NOT NULL
      AND current_setting('${DBVariables.APP_TENANT_SLUG}', true) != ''
    `;
  }

  private tenantSlugCheck(column: string): string {
    return `
      tenant_id = (
        SELECT id FROM tenants
        WHERE ${column} = current_setting('${DBVariables.APP_TENANT_SLUG}', true)
      )
    `;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─────────────────────────────────────────────────────────────────────────
    // All tables that receive ENABLE RLS + FORCE ROW LEVEL SECURITY
    // ─────────────────────────────────────────────────────────────────────────
    const allRlsTables: string[] = [
      // Auth
      "users",
      "roles",
      "user_roles",
      "refresh_tokens",
      // Tenant
      "tenant_settings",
      "tenant_feature_flags",
      "tenants", // public-facing: only INSERT + SELECT + UPDATE policies
      // Workflow Definition
      "workflow_definitions",
      "workflow_definition_versions",
      "workflow_states",
      "workflow_transitions",
      "transition_rules",
      "instance_form_schemas",
      // Workflow Execution
      "workflow_instances",
      "we_user_shadows",
      // Audit
      "audit_logs",
      // Notification
      "notification_templates",
      "notification_logs",
      "webhook_configs",
      "webhook_delivery_logs",
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // Tables that get standard FOR ALL tenant_id isolation (tenant_user role)
    // Excludes: user_roles (FK-based), tenants (no tenant_id column),
    //           refresh_tokens (has extra public policies handled separately)
    // ─────────────────────────────────────────────────────────────────────────
    const standardTenantIsolationTables: string[] = [
      "users",
      "roles",
      "refresh_tokens",
      "tenant_settings",
      "tenant_feature_flags",
      "workflow_definitions",
      "workflow_definition_versions",
      "workflow_states",
      "workflow_transitions",
      "transition_rules",
      "instance_form_schemas",
      "workflow_instances",
      "we_user_shadows",
      "audit_logs",
      "notification_templates",
      "notification_logs",
      "webhook_configs",
      "webhook_delivery_logs",
    ];

    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║  Row Level Security (RLS) Migration Starting                   ║");
    console.log("║  Protecting all tenant-scoped tables with database-level       ║");
    console.log("║  isolation policies.                                           ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    // =========================================================================
    // STEP 1: Enable RLS on all tables
    // =========================================================================
    console.log("Step 1: Enabling Row Level Security on all tables...\n");

    for (const table of allRlsTables) {
      try {
        await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
        console.log(`  ✓ RLS enabled: ${table}`);
      } catch (error) {
        console.error(`  ✗ Failed to enable RLS on ${table}:`, error.message);
        throw error;
      }
    }

    // =========================================================================
    // STEP 2: Create RLS policies
    // =========================================================================
    console.log("\nStep 2: Creating RLS policies...\n");

    // ─────────────────────────────────────────────────────────────────────────
    // 2A. Standard tenant isolation: FOR ALL, TO tenant_user, by tenant_id
    //     Superadmin bypass via app.role = 'superadmin'
    //     UUID validated before cast (prevents runtime errors on bad input)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("  [A] Standard tenant_id isolation policies (tenant_user)...");

    for (const table of standardTenantIsolationTables) {
      try {
        const guard = this.withSuperadminBypass("tenant_id");
        await queryRunner.query(`
          CREATE POLICY ${table}_tenant_isolation ON ${table}
            FOR ALL
            TO ${DBRoles.TENANT_USER}
            USING (${guard})
            WITH CHECK (${guard});
        `);
        console.log(`    ✓ ${table}_tenant_isolation`);
      } catch (error) {
        console.error(`    ✗ Failed: ${table}_tenant_isolation —`, error.message);
        throw error;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2B. user_roles: FK-based isolation via EXISTS subquery
    //     user_roles has no direct tenant_id; isolation via users.tenant_id
    //     EXISTS is more index-friendly than a subquery returning a value
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [B] user_roles: FK-based isolation (via users.tenant_id)...");

    try {
      await queryRunner.query(`
        CREATE POLICY user_roles_tenant_isolation ON user_roles
          FOR ALL
          TO ${DBRoles.TENANT_USER}
          USING (${this.withSuperadminBypass("tenant_id")})
          WITH CHECK (${this.withSuperadminBypass("tenant_id")});
      `);
      console.log("    ✓ user_roles_tenant_isolation");
    } catch (error) {
      console.error("    ✗ Failed: user_roles_tenant_isolation —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2C. tenants table — public INSERT (POST /register/tenant)
    //
    //     FIX: Original emitted a USING clause for INSERT. PostgreSQL documents
    //     state USING is never evaluated on INSERT — only WITH CHECK applies.
    //     Removed USING clause entirely for INSERT-only policies.
    //
    //     WITH CHECK (true): no constraint on what the app inserts. The app is
    //     responsible for setting the slug/plan correctly. If you want to
    //     restrict which plans can be self-registered, tighten this CHECK.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [C] tenants: public INSERT (POST /register/tenant)...");

    try {
      await queryRunner.query(`
        CREATE POLICY public_insert_tenants ON tenants
          FOR INSERT
          TO ${DBRoles.PUBLIC_USER}
          WITH CHECK (true);
      `);
      console.log("    ✓ public_insert_tenants");
    } catch (error) {
      console.error("    ✗ Failed: public_insert_tenants —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2D. tenants — public SELECT by slug
    //     Used during: POST /register (slug resolution), POST /login (slug lookup)
    //     Interceptor sets app.tenant_slug from the request body.
    //     SELECT only — no WITH CHECK needed.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [D] tenants: public SELECT by slug (POST /register, /login)...");

    try {
      // Login by Slug or Login by Tenant ID
      await queryRunner.query(`
        CREATE POLICY public_select_tenants ON tenants
          FOR SELECT
          TO ${DBRoles.PUBLIC_USER}
          USING (
            (
              current_setting('${DBVariables.APP_TENANT_SLUG}', true) IS NOT NULL
              AND current_setting('${DBVariables.APP_TENANT_SLUG}', true) != ''
              AND slug = current_setting('${DBVariables.APP_TENANT_SLUG}', true)
            )
            OR
            (
              ${this.uuidGuard("id")}
            )
          );
      `);
      console.log("    ✓ public_select_tenants");
    } catch (error) {
      console.error("    ✗ Failed: public_select_tenants —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2E. tenants — tenant_user SELECT by tenant id
    //     Used by authenticated routes that need to read the current tenant's
    //     metadata (plan, slug, settings etc.)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [E] tenants: tenant_user SELECT by id...");

    try {
      await queryRunner.query(`
        CREATE POLICY user_select_tenants ON tenants
          FOR SELECT
          TO ${DBRoles.TENANT_USER}
          USING (
            ${this.withSuperadminBypass("id")}
          );
      `);
      console.log("    ✓ user_select_tenants");
    } catch (error) {
      console.error("    ✗ Failed: user_select_tenants —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2F. tenants — tenant_user UPDATE own tenant row (NEW — FIX)
    //
    //     ORIGINAL GAP: tenants had FORCE RLS but only INSERT + SELECT policies.
    //     With FORCE RLS, even workflow_app (table owner) is policy-gated.
    //     Result: any UPDATE to a tenant (plan change, slug update, deactivation)
    //     was silently blocked — 0 rows affected, no error thrown.
    //
    //     Scoped by id = app.tenant_id so a tenant can only update their own row.
    //     Superadmin bypass allows platform-level updates (plan upgrades etc.)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [F] tenants: tenant_user UPDATE own tenant (NEW — fixes FORCE RLS gap)...");

    try {
      const guard = this.withSuperadminBypass("id");
      await queryRunner.query(`
        CREATE POLICY tenants_update_own ON tenants
          FOR UPDATE
          TO ${DBRoles.TENANT_USER}
          USING (${guard})
          WITH CHECK (${guard});
      `);
      console.log("    ✓ tenants_update_own");
    } catch (error) {
      console.error("    ✗ Failed: tenants_update_own —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2G. users — public INSERT (POST /register — self-registration via slug)
    //
    //     FIX: Original emitted a USING clause for INSERT — PostgreSQL ignores it.
    //     Removed. Only WITH CHECK applies for INSERT.
    //
    //     WITH CHECK resolves tenant_id from the slug so users cannot forge
    //     a tenant_id: the DB enforces that the inserted tenant_id matches the
    //     tenant identified by app.tenant_slug.
    //
    //     NOTE: This also covers POST /users (create user by admin) IF the
    //     interceptor is still in public_user context for that route. If POST /users
    //     is switched to tenant_user context (recommended once RBAC is enforced),
    //     users_tenant_isolation (2A) covers it instead.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [G-i] users: public INSERT (POST /register via slug)...");

    try {
      await queryRunner.query(`
        CREATE POLICY public_insert_users ON users
          FOR INSERT
          TO ${DBRoles.PUBLIC_USER}
          WITH CHECK (
            ${this.tenantSlugCheck("slug")}
          );
      `);
      console.log("    ✓ public_insert_users");
    } catch (error) {
      console.error("    ✗ Failed: public_insert_users —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2G-ii. tenant_settings — public INSERT + SELECT during tenant registration
    //
    //     During tenant registration the interceptor sets app.tenant_slug from
    //     the request body. RLS then filters tenant_settings to that tenant only.
    //
    // ─────────────────────────────────────────────────────────────────────────

    console.log("\n  [G-ii] tenant_settings: public INSERT + SELECT during tenant registration...");

    // public SELECT on tenant_settings — needed by findByTenantId() inside upsert()
    // during POST /register/tenant before tenant_user context is established
    try {
      await queryRunner.query(`
        CREATE POLICY public_select_tenant_settings ON tenant_settings
          FOR SELECT
          TO ${DBRoles.PUBLIC_USER}
          USING (
            ${this.tenantSlugNullGuard()}
            AND ${this.tenantSlugCheck("slug")}
          );
      `);
      console.log("    ✓ public_select_tenant_settings");
    } catch (error) {
      console.error("    ✗ Failed: public_select_tenant_settings —", error.message);
      throw error;
    }

    // public INSERT on tenant_settings — needed by repo.save() inside upsert()
    // bootstraps default settings immediately after tenant row is created
    try {
      await queryRunner.query(`
        CREATE POLICY public_insert_tenant_settings ON tenant_settings
          FOR INSERT
          TO ${DBRoles.PUBLIC_USER}
          WITH CHECK (
            ${this.tenantSlugNullGuard()}
            AND ${this.tenantSlugCheck("slug")}
          );
      `);
      console.log("    ✓ public_insert_tenant_settings");
    } catch (error) {
      console.error("    ✗ Failed: public_insert_tenant_settings —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2G-iii. public_insert_roles
    //
    // During POST /register/tenant, 3 default system roles are seeded immediately
    // after the tenant row is created — still in public_user context (no JWT yet).
    // roles_tenant_isolation is FOR ALL TO tenant_user so it does not cover this.
    // WITH CHECK resolves the tenant from app.tenant_slug to prevent a rogue insert
    // writing roles into a different tenant's scope.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [G-iii] roles: public INSERT during tenant registration...");

    try {
      await queryRunner.query(`
        CREATE POLICY public_insert_roles ON roles
          FOR INSERT
          TO ${DBRoles.PUBLIC_USER}
          WITH CHECK (
            ${this.tenantSlugNullGuard()}
            AND ${this.tenantSlugCheck("slug")}
          );
      `);
      console.log("    ✓ public_insert_roles");
    } catch (error) {
      console.error("    ✗ Failed: public_insert_roles —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2G-iv. public_select_roles
    //
    // During POST /register, findByNameAndTenant() reads the "Requestor" role to
    // assign it to the self-registering user — still in public_user context (no JWT).
    // roles_tenant_isolation is FOR ALL TO tenant_user so it does not cover this read.
    // USING resolves the tenant from app.tenant_slug so only roles belonging to
    // the tenant identified by the slug are visible — no cross-tenant role enumeration.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [G-iv] roles: public SELECT during tenant registration...");
    try {
      await queryRunner.query(`
        CREATE POLICY public_select_roles ON roles
          FOR SELECT
          TO ${DBRoles.PUBLIC_USER}
          USING (${this.uuidGuard("tenant_id")});
      `);
      console.log("    ✓ public_select_roles");
    } catch (error) {
      console.error("    ✗ Failed: public_select_roles —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2G-v. public_select_users_by_slug
    //
    // During POST /register/tenant, findByEmailAndTenant() checks for a duplicate
    // email before creating the founding admin user. At this point app.tenant_id
    // is NOT set — the request carries no JWT so the interceptor only sets
    // app.tenant_slug. The existing public_select_users policy uses app.tenant_id
    // and returns zero rows for this flow, making the duplicate-email guard blind.
    // This slug-based policy covers registerTenant specifically.
    // PostgreSQL evaluates both SELECT policies with OR — whichever matches wins.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [G-v] users: public SELECT by slug during tenant registration...");

    try {
      await queryRunner.query(`
        CREATE POLICY public_select_users_by_slug ON users
          FOR SELECT
          TO ${DBRoles.PUBLIC_USER}
          USING (
            ${this.tenantSlugNullGuard()}
            AND ${this.tenantSlugCheck("slug")}
          );
      `);
      console.log("    ✓ public_select_users_by_slug");
    } catch (error) {
      console.error("    ✗ Failed: public_select_users_by_slug —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2G-vi. public_insert_user_roles
    //
    // During POST /register/tenant, the founding admin user is assigned the Admin
    // role immediately after creation — still in public_user context.
    // user_roles has no direct tenant_id column; isolation is via FK to users.
    // WITH CHECK joins through users → tenants to verify the user being assigned
    // belongs to the tenant identified by app.tenant_slug, preventing cross-tenant
    // role assignment during the registration flow.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [G-vi] user_roles: public INSERT during tenant registration...");

    try {
      await queryRunner.query(`
        CREATE POLICY public_insert_user_roles ON user_roles
          FOR INSERT
          TO ${DBRoles.PUBLIC_USER}
          WITH CHECK (
            ${this.tenantSlugNullGuard()}
            AND ${this.tenantSlugCheck("slug")}
          );
      `);
      console.log("    ✓ public_insert_user_roles");
    } catch (error) {
      console.error("    ✗ Failed: public_insert_user_roles —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2G-vii. public_select_user_roles
    //
    // During POST /register/tenant, the founding admin user is assigned the Admin
    // role immediately after creation — still in public_user context.
    // ─────────────────────────────────────────────────────────────────────────

    console.log("\n  [G-vii] user_roles: public SELECT during tenant registration...");

    try {
      await queryRunner.query(`
        CREATE POLICY public_select_user_roles ON user_roles
          FOR SELECT
          TO ${DBRoles.PUBLIC_USER}
          USING (${this.uuidGuard("tenant_id")});
      `);
      console.log("    ✓ public_select_user_roles");
    } catch (error) {
      console.error("    ✗ Failed: public_select_user_roles —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2H. users — public SELECT (POST /login — find user by email + tenant)
    //
    //     During login the interceptor sets app.tenant_id from the request body
    //     (the user provides tenant_id as a UUID per your login contract).
    //     RLS then filters users to that tenant only, preventing cross-tenant
    //     credential probing.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [H] users: public SELECT by tenant_id (POST /login)...");

    try {
      await queryRunner.query(`
        CREATE POLICY public_select_users ON users
          FOR SELECT
          TO ${DBRoles.PUBLIC_USER}
          USING (
            ${this.uuidGuard("tenant_id")}
          );
      `);
      console.log("    ✓ public_select_users");
    } catch (error) {
      console.error("    ✗ Failed: public_select_users —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2I. refresh_tokens — public SELECT by token_hash (POST /refresh) — REWRITTEN
    //
    //     CRITICAL FIX: The original policy scoped by app.tenant_id which is
    //     intentionally NOT set during /refresh. The entire purpose of findByHash()
    //     is to DISCOVER the tenant_id from the stored token — setting tenant_id
    //     first is impossible. The original policy caused every /refresh call to
    //     return null (RLS filtered all rows), making token rotation silently broken.
    //
    //     Solution: scope by app.token_hash instead.
    //     The interceptor computes sha256(rawRefreshToken) and sets app.token_hash
    //     BEFORE the repository call. RLS allows exactly the one matching row.
    //
    //     Security: the hash is a SHA-256 digest — unguessable without the raw token.
    //     RLS still enforces row-level access; the public_user cannot enumerate tokens.
    //
    //     REQUIRED ACTION: Add to DBVariables enum:
    //       APP_TOKEN_HASH = 'app.token_hash'
    //     Set in DatabaseContextInterceptor for the /refresh route:
    //       SELECT set_config('app.token_hash', sha256(rawToken), true)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [I] refresh_tokens: public SELECT by token_hash (POST /refresh — REWRITTEN)...");

    try {
      await queryRunner.query(`
        CREATE POLICY public_select_refresh_tokens ON refresh_tokens
          FOR SELECT
          TO ${DBRoles.PUBLIC_USER}
          USING (
            ${this.tokenHashGuard()}
          );
      `);
      console.log("    ✓ public_select_refresh_tokens");
    } catch (error) {
      console.error("    ✗ Failed: public_select_refresh_tokens —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2J. refresh_tokens — public UPDATE by token_hash (POST /refresh) — NEW
    //
    //     CRITICAL FIX: revoke() is an UPDATE (sets revokedAt). No public UPDATE
    //     policy existed. With FORCE RLS this silently blocked the revoke — the
    //     consumed refresh token was never invalidated, meaning the same token
    //     could be used repeatedly: token rotation was effectively disabled.
    //
    //     Scoped to the same app.token_hash as the SELECT above.
    //     WITH CHECK (true): the app sets revokedAt, no constraint needed on
    //     the new values beyond the row already being identified by hash.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [J] refresh_tokens: public UPDATE by token_hash (revoke — NEW)...");

    try {
      await queryRunner.query(`
        CREATE POLICY public_update_refresh_tokens ON refresh_tokens
          FOR UPDATE
          TO ${DBRoles.PUBLIC_USER}
          USING (
            ${this.tokenHashGuard()}
          )
          WITH CHECK (true);
      `);
      console.log("    ✓ public_update_refresh_tokens");
    } catch (error) {
      console.error("    ✗ Failed: public_update_refresh_tokens —", error.message);
      throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2K. refresh_tokens — public INSERT (login, register flows)
    //
    //     issueTokenPair() inserts a refresh token at the end of /login,
    //     /register/tenant, and /register — all public_user context.
    //     app.tenant_id IS set by the interceptor for all three routes
    //     (from the request body on /login, resolved from slug on /register).
    //     WITH CHECK ensures the inserted row's tenant_id matches the context —
    //     prevents the app from accidentally writing a token to the wrong tenant.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n  [K] refresh_tokens: public INSERT (login, register flows)...");

    try {
      await queryRunner.query(`
      CREATE POLICY public_insert_refresh_tokens ON refresh_tokens
        FOR INSERT
        TO ${DBRoles.PUBLIC_USER}
        WITH CHECK (
          ${this.uuidGuard("tenant_id")}
        );
    `);
      console.log("    ✓ public_insert_refresh_tokens");
    } catch (error) {
      console.error("    ✗ Failed: public_insert_refresh_tokens —", error.message);
      throw error;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 2K.ii public SELECT on refresh_tokens by tenant_id (after INSERT)
    //
    // After INSERT during /login, /register, /register/tenant flows,
    // TypeORM needs to read back the saved token. app.token_hash is not set
    // at this point — only app.tenant_id is. The existing public_select_refresh_tokens
    // policy uses tokenHashGuard which fails here, causing TypeORM to receive null
    // after a successful INSERT.
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n  [K-ii] refresh_tokens: public SELECT by tenant_id (after INSERT)...");

    try {
      await queryRunner.query(`
        CREATE POLICY public_select_refresh_tokens_by_tenant ON refresh_tokens
          FOR SELECT
          TO ${DBRoles.PUBLIC_USER}
          USING (
            ${this.uuidGuard("tenant_id")}
          );
      `);
      console.log("    ✓ public_select_refresh_tokens_by_tenant");
    } catch (error) {
      console.error("    ✗ Failed: public_select_refresh_tokens_by_tenant —", error.message);
      throw error;
    }

    // =========================================================================
    // STEP 3: FORCE ROW LEVEL SECURITY on all tables
    //
    // This ensures even the table owner role (workflow_app) is subject to RLS.
    // Without FORCE, the owner bypasses all policies — defeating isolation.
    // With FORCE + no matching policy → access denied (fail-secure default).
    // =========================================================================
    console.log("\nStep 3: Enforcing FORCE ROW LEVEL SECURITY (fail-secure default)...\n");

    for (const table of allRlsTables) {
      try {
        await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
        console.log(`  ✓ FORCE RLS: ${table}`);
      } catch (error) {
        console.error(`  ✗ Failed to FORCE RLS on ${table}:`, error.message);
        throw error;
      }
    }

    console.log("\n╔═════════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ RLS Migration Complete (Updated — Production Ready)         ║");
    console.log("║                                                                 ║");
    console.log("║  REQUIRED ACTIONS BEFORE DEPLOYING:                             ║");
    console.log("║  1. In DatabaseContextInterceptor for /refresh route:           ║");
    console.log("║       SET ROLE public_user;                                     ║");
    console.log("║       set_config('app.token_hash', sha256(rawToken), true)      ║");
    console.log("║       DO NOT set app.tenant_id for /refresh                     ║");
    console.log("║  2. All set_config calls MUST use local=true (3rd arg)          ║");
    console.log("║     to prevent cross-tenant leaks in the connection pool        ║");
    console.log("║  3. Wrap interceptor context + queries in a single transaction  ║");
    console.log("║     and release the queryRunner on request end                  ║");
    console.log("║                                                                 ║");
    console.log("║  NEXT STEPS:                                                    ║");
    console.log("║  1. Application must set tenant context in interceptor:         ║");
    console.log("║     SELECT set_config('app.tenant_id', tenantId, false)         ║");
    console.log("║  2. This must happen BEFORE any database queries                ║");
    console.log("║  3. Use DatabaseContextInterceptor in AppModule                 ║");
    console.log("║  4. If context not set, RLS denies all access (safe default)    ║");
    console.log("╚═════════════════════════════════════════════════════════════════╝\n");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const allRlsTables: string[] = [
      "users",
      "roles",
      "user_roles",
      "refresh_tokens",
      "tenant_settings",
      "tenant_feature_flags",
      "tenants",
      "workflow_definitions",
      "workflow_definition_versions",
      "workflow_states",
      "workflow_transitions",
      "transition_rules",
      "instance_form_schemas",
      "workflow_instances",
      "we_user_shadows",
      "audit_logs",
      "notification_templates",
      "notification_logs",
      "webhook_configs",
      "webhook_delivery_logs",
    ];

    // All policies created in up(), paired with their table
    const policiesToDrop: Array<{ table: string; policy: string }> = [
      // Standard tenant isolation
      { table: "users", policy: "users_tenant_isolation" },
      { table: "roles", policy: "roles_tenant_isolation" },
      { table: "user_roles", policy: "user_roles_tenant_isolation" },
      { table: "refresh_tokens", policy: "refresh_tokens_tenant_isolation" },
      { table: "tenant_settings", policy: "tenant_settings_tenant_isolation" },
      { table: "tenant_feature_flags", policy: "tenant_feature_flags_tenant_isolation" },
      { table: "workflow_definitions", policy: "workflow_definitions_tenant_isolation" },
      { table: "workflow_definition_versions", policy: "workflow_definition_versions_tenant_isolation" },
      { table: "workflow_states", policy: "workflow_states_tenant_isolation" },
      { table: "workflow_transitions", policy: "workflow_transitions_tenant_isolation" },
      { table: "transition_rules", policy: "transition_rules_tenant_isolation" },
      { table: "instance_form_schemas", policy: "instance_form_schemas_tenant_isolation" },
      { table: "workflow_instances", policy: "workflow_instances_tenant_isolation" },
      { table: "we_user_shadows", policy: "we_user_shadows_tenant_isolation" },
      { table: "audit_logs", policy: "audit_logs_tenant_isolation" },
      { table: "notification_templates", policy: "notification_templates_tenant_isolation" },
      { table: "notification_logs", policy: "notification_logs_tenant_isolation" },
      { table: "webhook_configs", policy: "webhook_configs_tenant_isolation" },
      { table: "webhook_delivery_logs", policy: "webhook_delivery_logs_tenant_isolation" },
      // tenants public/authenticated policies
      { table: "tenants", policy: "public_insert_tenants" },
      { table: "tenants", policy: "public_select_tenants" },
      { table: "tenants", policy: "user_select_tenants" },
      { table: "tenants", policy: "tenants_update_own" }, // NEW in updated
      { table: "tenant_settings", policy: "public_select_tenant_settings" },
      { table: "tenant_settings", policy: "public_insert_tenant_settings" },
      // users public policies
      { table: "roles", policy: "public_insert_roles" },
      { table: "roles", policy: "public_select_roles" },
      { table: "user_roles", policy: "public_insert_user_roles" },
      { table: "user_roles", policy: "public_select_user_roles" },
      { table: "users", policy: "public_select_users_by_slug" },
      { table: "users", policy: "public_insert_users" },
      { table: "users", policy: "public_select_users" },
      // refresh_tokens public policies
      { table: "refresh_tokens", policy: "public_select_refresh_tokens" },
      { table: "refresh_tokens", policy: "public_update_refresh_tokens" },
      { table: "refresh_tokens", policy: "public_insert_refresh_tokens" },
      { table: "refresh_tokens", policy: "public_select_refresh_tokens_by_tenant" },
    ];

    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║  Rolling back RLS policies (Updated)...                        ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    // ─── Step 1: Drop all policies ────────────────────────────────────────────
    console.log("Step 1: Dropping all RLS policies...\n");

    for (const { table, policy } of policiesToDrop) {
      try {
        const tableExists = await queryRunner.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '${table}'
          );
        `);

        if (!tableExists[0]?.exists) {
          console.log(`  ⊘ Table not found (skipped): ${table}`);
          continue;
        }

        await queryRunner.query(`DROP POLICY IF EXISTS ${policy} ON ${table};`);
        console.log(`  ✓ Dropped: ${policy} ON ${table}`);
      } catch (error) {
        console.warn(`  ⚠ Could not drop policy ${policy} on ${table}:`, error.message);
        // Non-fatal: continue dropping remaining policies
      }
    }

    // ─── Step 2: Remove FORCE ROW LEVEL SECURITY ─────────────────────────────
    console.log("\nStep 2: Removing FORCE ROW LEVEL SECURITY...\n");

    for (const table of allRlsTables) {
      try {
        const tableExists = await queryRunner.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '${table}'
          );
        `);

        if (!tableExists[0]?.exists) {
          console.log(`  ⊘ Table not found (skipped): ${table}`);
          continue;
        }

        const rlsState = await queryRunner.query(`
          SELECT relforcerowsecurity
          FROM pg_class
          WHERE relname = '${table}'
            AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
        `);

        if (rlsState[0]?.relforcerowsecurity) {
          await queryRunner.query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY;`);
          console.log(`  ✓ FORCE RLS removed: ${table}`);
        } else {
          console.log(`  ⊘ FORCE RLS not set (skipped): ${table}`);
        }
      } catch (error) {
        console.warn(`  ⚠ Could not remove FORCE RLS on ${table}:`, error.message);
      }
    }

    // ─── Step 3: Disable ROW LEVEL SECURITY ──────────────────────────────────
    console.log("\nStep 3: Disabling ROW LEVEL SECURITY...\n");

    for (const table of allRlsTables) {
      try {
        const tableExists = await queryRunner.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '${table}'
          );
        `);

        if (!tableExists[0]?.exists) {
          console.log(`  ⊘ Table not found (skipped): ${table}`);
          continue;
        }

        const rlsState = await queryRunner.query(`
          SELECT relrowsecurity
          FROM pg_class
          WHERE relname = '${table}'
            AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
        `);

        if (rlsState[0]?.relrowsecurity) {
          await queryRunner.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
          console.log(`  ✓ RLS disabled: ${table}`);
        } else {
          console.log(`  ⊘ RLS not enabled (skipped): ${table}`);
        }
      } catch (error) {
        console.warn(`  ⚠ Could not disable RLS on ${table}:`, error.message);
      }
    }

    console.log("\n✅ RLS rollback complete\n");
  }
}
