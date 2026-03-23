import { MigrationInterface, QueryRunner } from "typeorm";
import { DBRoles } from "@app/database/constants/db-roles.enum";
import { DBVariables } from "@app/database/constants/db-variables.enum";

/**
 * Migration: Create Row-Level Security (RLS) Policies for Multi-Tenant Isolation
 *
 * This migration implements PostgreSQL Row-Level Security (RLS) for all tenant-scoped tables.
 * RLS enforces tenant isolation at the DATABASE LAYER — even if application code accidentally
 * omits the WHERE tenant_id = :tenantId clause, the database automatically filters data.
 *
 * ============================================================================
 * HOW RLS WORKS:
 * ============================================================================
 *
 * 1. Enable RLS on the table:
 *    ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
 *
 * 2. Create policies that check: row.tenant_id = current_setting('app.tenant_id')
 *    CREATE POLICY policy_name ON table_name
 *      FOR ALL
 *      USING (tenant_id = (current_setting('app.tenant_id'))::uuid);
 *
 * 3. Application sets context BEFORE queries (via DatabaseContextInterceptor):
 *    SELECT set_config('app.tenant_id', $1::text, false);
 *    This makes current_setting('app.tenant_id') return the tenant_id value.
 *
 * 4. PostgreSQL AUTOMATICALLY filters all queries to match the tenant context:
 *    SELECT * FROM users WHERE id = $1;
 *    ↓ PostgreSQL transparently adds:
 *    SELECT * FROM users WHERE id = $1 AND tenant_id = :context_tenant_id;
 *
 * ============================================================================
 * SECURITY GUARANTEES:
 * ============================================================================
 *
 * ✓ SQL Injection Protection:
 *   Even if attacker injects: WHERE 1=1 OR ..., RLS still filters to tenant context
 *
 * ✓ Developer Mistakes:
 *   If developer forgets tenantId in WHERE clause, RLS adds it automatically
 *
 * ✓ Database Credential Compromise:
 *   Even direct DB access respects RLS policies (attacker must also bypass context setting)
 *
 * ✓ Fail-Secure Default:
 *   FORCE ROW LEVEL SECURITY means: if context not set, ALL access is denied (safe default)
 *
 * ============================================================================
 * TABLES PROTECTED (All with tenant_id column):
 * ============================================================================
 * Auth Module: users, roles, user_roles (via FK), refresh_tokens
 * Tenant Module: tenant_settings, tenant_feature_flags
 * Workflow Definition: workflow_definitions, workflow_definition_versions, workflow_states,
 *                      workflow_transitions, transition_rules, instance_form_schemas
 * Workflow Execution: workflow_instances, we_user_shadows
 * Audit Module: audit_logs
 * Notification Module: notification_templates, notification_logs, webhook_configs,
 *                      webhook_delivery_logs
 *
 * EXCLUDED TABLES:
 * - "tenants" table has NO tenant_id (it IS the root), so no RLS needed
 * - "permissions" table is global/system-wide, not tenant-scoped
 * - No "role_permissions" join table found in entities
 * - No "rule_templates" entity found in rule-engine module
 */
export class CreateRlsPolicies1772830604496 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // All tenant-scoped tables (all except "tenants" which has no tenant_id column)
    const tenantScopedTables = [
      // ------- Tenant Scoped Tables -------------------------------
      // Auth Module
      "users",
      "roles",
      "user_roles",
      "refresh_tokens",
      // Tenant Module
      "tenant_settings",
      "tenant_feature_flags",
      // Workflow Definition Module
      "workflow_definitions",
      "workflow_definition_versions",
      "workflow_states",
      "workflow_transitions",
      "transition_rules",
      "instance_form_schemas",
      // Workflow Execution Module
      "workflow_instances",
      "we_user_shadows",
      // Audit Module
      "audit_logs",
      // Notification Module
      "notification_templates",
      "notification_logs",
      "webhook_configs",
      "webhook_delivery_logs",
      // ------- Public Scoped Tables -------------------------------
      "tenants",
    ];

    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║  Row Level Security (RLS) Migration Starting                   ║");
    console.log("║  Protecting all tenant-scoped tables with database-level       ║");
    console.log("║  isolation policies.                                           ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    // ─── Step 1: Enable RLS on all tables ───────────────────────────────────────
    console.log("Step 1: Enabling Row Level Security on all tables...\n");

    for (const table of tenantScopedTables) {
      try {
        await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
        console.log(`  ✓ RLS enabled: ${table}`);
      } catch (error) {
        console.error(`  ✗ Failed to enable RLS on ${table}:`, error.message);
        throw error;
      }
    }

    // ─── Step 2: Create isolation policies for each table ──────────────────────
    console.log("\nStep 2: Creating tenant isolation policies...\n");

    const policyDefinitions = [
      // ------- Tenant Scoped Definitions -------------------------------
      // Auth Module
      {
        table: "users",
        policyName: "users_tenant_isolation",
      },
      {
        table: "roles",
        policyName: "roles_tenant_isolation",
      },
      {
        table: "permissions",
        policyName: "permissions_tenant_isolation",
        hasNoTenantId: true, // permissions is global, not tenant-scoped
        skip: true, // Skip creating policy for this table
      },
      {
        table: "user_roles",
        policyName: "user_roles_tenant_isolation",
        joinTable: "users",
        joinColumn: "user_id",
      },
      {
        table: "refresh_tokens",
        policyName: "refresh_tokens_tenant_isolation",
      },
      // Tenant Module
      {
        table: "tenant_settings",
        policyName: "tenant_settings_tenant_isolation",
      },
      {
        table: "tenant_feature_flags",
        policyName: "tenant_feature_flags_tenant_isolation",
      },
      // Workflow Definition Module
      {
        table: "workflow_definitions",
        policyName: "workflow_definitions_tenant_isolation",
      },
      {
        table: "workflow_definition_versions",
        policyName: "workflow_definition_versions_tenant_isolation",
      },
      {
        table: "workflow_states",
        policyName: "workflow_states_tenant_isolation",
      },
      {
        table: "workflow_transitions",
        policyName: "workflow_transitions_tenant_isolation",
      },
      {
        table: "transition_rules",
        policyName: "transition_rules_tenant_isolation",
      },
      {
        table: "instance_form_schemas",
        policyName: "instance_form_schemas_tenant_isolation",
      },
      // Workflow Execution Module
      {
        table: "workflow_instances",
        policyName: "workflow_instances_tenant_isolation",
      },
      {
        table: "we_user_shadows",
        policyName: "we_user_shadows_tenant_isolation",
      },
      // Audit Module
      {
        table: "audit_logs",
        policyName: "audit_logs_tenant_isolation",
      },
      // Notification Module
      {
        table: "notification_templates",
        policyName: "notification_templates_tenant_isolation",
      },
      {
        table: "notification_logs",
        policyName: "notification_logs_tenant_isolation",
      },
      {
        table: "webhook_configs",
        policyName: "webhook_configs_tenant_isolation",
      },
      {
        table: "webhook_delivery_logs",
        policyName: "webhook_delivery_logs_tenant_isolation",
      },

      // ------- Public Scoped Definitions -------------------------------
      // Tenant Module
      {
        table: "tenants",
        policyName: "public_insert_tenants",
        for: "INSERT", // { ALL | SELECT | INSERT | UPDATE | DELETE }
        to: DBRoles.PUBLIC_USER, // [ TO { role_name | PUBLIC | CURRENT_USER | SESSION_USER } [, ...] ]
      },
      {
        table: "tenants",
        policyName: "public_select_tenants",
        for: "SELECT", // { ALL | SELECT | INSERT | UPDATE | DELETE }
        to: DBRoles.PUBLIC_USER, // [ TO { role_name | PUBLIC | CURRENT_USER | SESSION_USER } [, ...] ]
        columnName: "slug", // column identifier for table
        variableName: DBVariables.APP_TENANT_SLUG, // app.* is a session variable to be set during runtime
      },
      {
        table: "tenants",
        policyName: "user_select_tenants",
        for: "SELECT", // { ALL | SELECT | INSERT | UPDATE | DELETE }
        to: DBRoles.TENANT_USER, // [ TO { role_name | PUBLIC | CURRENT_USER | SESSION_USER } [, ...] ]
        columnName: "id",
        variableName: DBVariables.APP_TENANT_ID,
      },
      // User Module
      // Self registeration Via Slug
      {
        table: "users",
        policyName: "public_insert_users",
        for: "INSERT", // { ALL | SELECT | INSERT | UPDATE | DELETE }
        to: DBRoles.PUBLIC_USER, // [ TO { role_name | PUBLIC | CURRENT_USER | SESSION_USER } [, ...] ]
      },
      {
        table: "users",
        policyName: "public_select_users",
        for: "SELECT",
        to: DBRoles.PUBLIC_USER,
      },
      {
        table: "refresh_tokens",
        policyName: "public_select_refresh_tokens",
        for: "SELECT",
        to: DBRoles.PUBLIC_USER,
      },
    ];

    for (const def of policyDefinitions) {
      // Skip global tables without tenant_id
      if ("skip" in def && def.skip) {
        console.log(`  ⊘ Skipped (no tenant_id): ${def.table}`);
        continue;
      }

      try {
        let policySql: string;

        // For join tables, create policy that checks tenant_id via FK
        if ("joinTable" in def && "joinColumn" in def && def.joinTable && def.joinColumn) {
          // policySql = `
          //   CREATE POLICY ${def.policyName} ON ${def.table}
          //     FOR ALL
          //     USING (
          //       (SELECT tenant_id FROM ${def.joinTable} WHERE id = ${def.table}.${def.joinColumn})
          //       = (current_setting('app.tenant_id'))::uuid
          //     );
          // `;
          policySql = `
            CREATE POLICY ${def.policyName} ON ${def.table}
              FOR ALL
              TO ${DBRoles.TENANT_USER} -- [ TO { role_name | PUBLIC | CURRENT_USER | SESSION_USER } [, ...] ]
              USING (
              -- ✅ Use EXISTS (more index-friendly):
                EXISTS (
                  SELECT 1
                  FROM ${def.joinTable} jt
                  WHERE jt.id = ${def.table}.${def.joinColumn}
                    AND jt.tenant_id = current_setting('app.tenant_id', true)::uuid
                )
              )
              WITH CHECK (
                EXISTS (
                  SELECT 1
                  FROM ${def.joinTable} jt
                  WHERE jt.id = ${def.table}.${def.joinColumn}
                    AND jt.tenant_id = current_setting('app.tenant_id', true)::uuid
                )
              );
          `;
          const comment = "comment" in def && def.comment ? ` - ${def.comment}` : "";
          console.log(`  ✓ Policy created (via FK): ${def.policyName}${comment}`);
        } else {
          // For direct tenant_id column - BaseEntity always uses tenant_id in DB
          const columnName = "columnName" in def && def.columnName ? def.columnName : "tenant_id";
          const forClause = "for" in def && def.for ? def.for : "ALL";
          const toClause = "to" in def && def.to ? def.to : DBRoles.TENANT_USER;
          const variableName =
            "variableName" in def && def.variableName ? def.variableName : DBVariables.APP_TENANT_ID;

          let usingClause: string = "";
          let withClause: string = "";

          if (forClause === "SELECT") {
            withClause = ``;
          } else if (forClause === "INSERT") {
            if (def.policyName === "public_insert_users") {
              // Handling public insert for users table: SPECIAL CASE
              withClause = `
                  WITH CHECK (
                    tenant_id = (
                      SELECT id FROM tenants
                      WHERE slug = current_setting('app.tenant_slug', true)
                    )
                  );`;
            } else {
              withClause = `WITH CHECK (true);`;
            }
          } else {
            // here FOR === ALL
            withClause = `
                WITH CHECK (
                  CASE
                    -- ✅ BYPASS RLS FOR SUPERADMIN ROLE; Superadmin can insert/update any tenant
                    WHEN current_setting('app.role', true) = 'superadmin'
                      THEN true
                    ELSE 
                      current_setting('app.tenant_id', true) IS NOT NULL
                      AND current_setting('app.tenant_id', true) ~* '^[0-9a-f-]{36}$'
                      AND ${columnName} = current_setting('app.tenant_id', true)::uuid
                  END
                );
            `;
          }

          switch (variableName) {
            case DBVariables.APP_TENANT_SLUG:
              usingClause = `${columnName} = current_setting('app.tenant_slug', true)`;
              break;
            case DBVariables.APP_TENANT_ID:
              usingClause = `current_setting('app.tenant_id', true) IS NOT NULL
                            AND current_setting('app.tenant_id', true) ~* '^[0-9a-f-]{36}$'
                            AND ${columnName} = current_setting('app.tenant_id', true)::uuid`;

              break;

            default:
              usingClause = `${columnName} = current_setting('app.tenant_id', true)::uuid`;
              break;
          }

          // policySql = `
          //   CREATE POLICY ${def.policyName} ON ${def.table}
          //     FOR ALL
          //     USING (${columnName} = (current_setting('app.tenant_id'))::uuid);
          // `;
          policySql = `
            CREATE POLICY ${def.policyName} ON ${def.table}
              FOR ${forClause} -- { ALL | SELECT | INSERT | UPDATE | DELETE }
              TO ${toClause} -- [ TO { role_name | PUBLIC | CURRENT_USER | SESSION_USER } [, ...] ]
                USING (
                  CASE
                    -- ✅ BYPASS RLS FOR SUPERADMIN ROLE; Superadmin can read any tenant
                    WHEN current_setting('app.role', true) = 'superadmin'
                      THEN true
                    ELSE 
                    -- ✅ ENFORCE RLS FOR TENANT ROLE, VALIDATE BEFORE CASTING TO UUID
                      ${usingClause}
                  END
                )
                ${withClause}
          `;

          // ❌ CREATES GLOBAL ACCESS, DEFEATS THE RLS PURPOSE
          // policySql = `
          //   CREATE POLICY ${def.policyName} ON ${def.table}
          //     FOR ALL
          //     USING (
          //       -- If context is missing/empty → allow all rows (superadmin / service role)
          //       -- If context is a valid UUID → filter to that tenant only
          //       CASE
          //         WHEN current_setting('app.tenant_id', true) IS NULL
          //           OR current_setting('app.tenant_id', true) = ''
          //         THEN true
          //         ELSE ${columnName} = current_setting('app.tenant_id', true)::uuid
          //       END
          //     );
          // `;
          console.log(`  ✓ Policy created: ${def.policyName} (column: ${columnName})`);
        }

        await queryRunner.query(policySql);
      } catch (error) {
        console.error(`  ✗ Failed to create policy for ${def.table}:`, error.message);
        throw error;
      }
    }

    // ─── Step 3: Force RLS (deny all by default) ────────────────────────────────
    console.log("\nStep 3: Enforcing Row Level Security as default (deny-all)...\n");

    for (const table of tenantScopedTables) {
      try {
        await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
        console.log(`  ✓ RLS enforced (fail-secure): ${table}`);
      } catch (error) {
        console.error(`  ✗ Failed to enforce RLS on ${table}:`, error.message);
        throw error;
      }
    }

    console.log("\n╔═════════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ Row Level Security Migration Complete!                      ║");
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
    const tenantScopedTables = [
      "users",
      "roles",
      "user_roles",
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

    // Policy definitions matching the up() method
    const policyDefinitions = [
      // ------- Tenant Scoped Definitions -------------------------------
      // Auth Module
      {
        table: "users",
        policyName: "users_tenant_isolation",
      },
      {
        table: "roles",
        policyName: "roles_tenant_isolation",
      },
      {
        table: "user_roles",
        policyName: "user_roles_tenant_isolation",
      },
      {
        table: "refresh_tokens",
        policyName: "refresh_tokens_tenant_isolation",
      },
      // Tenant Module
      {
        table: "tenant_settings",
        policyName: "tenant_settings_tenant_isolation",
      },
      {
        table: "tenant_feature_flags",
        policyName: "tenant_feature_flags_tenant_isolation",
      },
      // Workflow Definition Module
      {
        table: "workflow_definitions",
        policyName: "workflow_definitions_tenant_isolation",
      },
      {
        table: "workflow_definition_versions",
        policyName: "workflow_definition_versions_tenant_isolation",
      },
      {
        table: "workflow_states",
        policyName: "workflow_states_tenant_isolation",
      },
      {
        table: "workflow_transitions",
        policyName: "workflow_transitions_tenant_isolation",
      },
      {
        table: "transition_rules",
        policyName: "transition_rules_tenant_isolation",
      },
      {
        table: "instance_form_schemas",
        policyName: "instance_form_schemas_tenant_isolation",
      },
      // Workflow Execution Module
      {
        table: "workflow_instances",
        policyName: "workflow_instances_tenant_isolation",
      },
      {
        table: "we_user_shadows",
        policyName: "we_user_shadows_tenant_isolation",
      },
      // Audit Module
      {
        table: "audit_logs",
        policyName: "audit_logs_tenant_isolation",
      },
      // Notification Module
      {
        table: "notification_templates",
        policyName: "notification_templates_tenant_isolation",
      },
      {
        table: "notification_logs",
        policyName: "notification_logs_tenant_isolation",
      },
      {
        table: "webhook_configs",
        policyName: "webhook_configs_tenant_isolation",
      },
      {
        table: "webhook_delivery_logs",
        policyName: "webhook_delivery_logs_tenant_isolation",
      },

      // ------- Public Scoped Definitions -------------------------------
      // Tenant Module
      {
        table: "tenants",
        policyName: "public_insert_tenants",
      },
      {
        table: "tenants",
        policyName: "public_select_tenants",
      },
      {
        table: "tenants",
        policyName: "user_select_tenants",
      },
      // User Module
      // Self registeration Via Slug
      {
        table: "users",
        policyName: "public_insert_users",
      },
      {
        table: "users",
        policyName: "public_select_users",
      },
      {
        table: "refresh_tokens",
        policyName: "public_select_refresh_tokens",
      },
    ];

    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║  Rolling back Row Level Security policies...                   ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    // ─── Step 1: Drop all RLS policies first ───────────────────────────────────
    console.log("Step 1: Dropping RLS policies...\n");

    for (const def of policyDefinitions) {
      try {
        // Check if table exists before trying to drop policy
        const tableExists = await queryRunner.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = '${def.table}'
          );
        `);

        if (tableExists[0]?.exists) {
          // Check if policy exists before trying to drop it
          const policyExists = await queryRunner.query(`
            SELECT EXISTS (
              SELECT FROM pg_policies
              WHERE schemaname = 'public'
              AND tablename = '${def.table}'
              AND policyname = '${def.policyName}'
            );
          `);

          if (policyExists[0]?.exists) {
            await queryRunner.query(`DROP POLICY IF EXISTS ${def.policyName} ON ${def.table};`);
            console.log(`  ✓ Policy dropped: ${def.policyName}`);
          } else {
            console.log(`  ⊘ Policy not found (skipped): ${def.policyName}`);
          }
        } else {
          console.log(`  ⊘ Table not found (skipped): ${def.table}`);
        }
      } catch (error) {
        console.warn(`  ⚠ Could not drop policy ${def.policyName}:`, error.message);
        // Continue with other policies - don't abort transaction
      }
    }

    // ─── Step 2: Disable FORCE ROW LEVEL SECURITY ──────────────────────────────
    console.log("\nStep 2: Disabling FORCE ROW LEVEL SECURITY...\n");

    for (const table of tenantScopedTables) {
      try {
        // Check if table exists first
        const tableExists = await queryRunner.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = '${table}'
          );
        `);

        if (tableExists[0]?.exists) {
          // Check if RLS is enabled before trying to disable it
          const rlsEnabled = await queryRunner.query(`
            SELECT relrowsecurity, relforcerowsecurity
            FROM pg_class
            WHERE relname = '${table}' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
          `);

          if (rlsEnabled[0]?.relforcerowsecurity) {
            await queryRunner.query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY;`);
            console.log(`  ✓ FORCE RLS disabled: ${table}`);
          } else {
            console.log(`  ⊘ FORCE RLS not enabled (skipped): ${table}`);
          }
        } else {
          console.log(`  ⊘ Table not found (skipped): ${table}`);
        }
      } catch (error) {
        console.warn(`  ⚠ Could not disable FORCE RLS on ${table}:`, error.message);
        // Continue with other tables - don't abort transaction
      }
    }

    // ─── Step 3: Disable ROW LEVEL SECURITY ─────────────────────────────────────
    console.log("\nStep 3: Disabling ROW LEVEL SECURITY...\n");

    for (const table of tenantScopedTables) {
      try {
        // Check if table exists first
        const tableExists = await queryRunner.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = '${table}'
          );
        `);

        if (tableExists[0]?.exists) {
          // Check if RLS is enabled before trying to disable it
          const rlsEnabled = await queryRunner.query(`
            SELECT relrowsecurity
            FROM pg_class
            WHERE relname = '${table}' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
          `);

          if (rlsEnabled[0]?.relrowsecurity) {
            await queryRunner.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
            console.log(`  ✓ RLS disabled: ${table}`);
          } else {
            console.log(`  ⊘ RLS not enabled (skipped): ${table}`);
          }
        } else {
          console.log(`  ⊘ Table not found (skipped): ${table}`);
        }
      } catch (error) {
        console.warn(`  ⚠ Could not disable RLS on ${table}:`, error.message);
        // Continue with other tables - don't abort transaction
      }
    }

    console.log("\n✅ RLS rollback complete\n");
  }
}
