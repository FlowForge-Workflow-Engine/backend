select * from migrations m ;

--insert values into migrations
INSERT INTO migrations (timestamp, name)
VALUES 
(1772700631702, 'Migration1772700631702'),
(1772700632702, 'CreateRlsPolicies1772700632702');


-- 0) List all Tables in DB (non-system schemas)
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name;


-- 0) List all Tables in DB (non-system schemas)
select * 
FROM pg_tables
WHERE tableowner = 'workflow_app' -- set the role name
AND schemaname = 'public';


-- 1) List all RLS policies in the DB (non-system schemas)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
--and tablename = 'users'
ORDER BY schemaname, tablename, policyname;


-- 2) Check if RLS is enabled / forced on tables
SELECT
  n.nspname  AS schema_name,
  c.relname  AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
--AND c.relname = 'users'
ORDER BY schema_name, table_name;


-- 3) Show policies for one table (edit schema/table)
SELECT *
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'users'
ORDER BY policyname;


-- 4) Describe a Table (default 'users')
SELECT 
    column_name, 
    data_type, 
    character_maximum_length, 
    is_nullable, 
    column_default
FROM 
    information_schema.columns
WHERE 
    table_name = 'audit_logs'
ORDER BY 
    ordinal_position;


-- Check current connection details
SELECT 
  current_user as db_user,
  session_user as session_user,
  current_role as current_role,
  current_database() as db_name,
  inet_server_addr() as server_ip,
  inet_server_port() as server_port;


-- Check if your current user is a superuser
SELECT current_user, usesuper 
FROM pg_user 
WHERE usename = current_user;


-- Check if your user owns the users table
SELECT tableowner 
FROM pg_tables 
WHERE tablename = 'users';


-- Check current attributes for all roles
SELECT rolname, rolbypassrls FROM pg_roles 
WHERE rolname IN ('workflow_app', 'superadmin', 'tenant_user', 'public_user');


-- Update Database Owner
ALTER DATABASE "workflow-engine-test" OWNER TO workflow_app;


-- Find ALL DB USERS
select * from pg_user;


-- Re-assign Owner For Tables 
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 'ALTER TABLE ' || quote_ident(schemaname) || '.' || quote_ident(tablename) || ' OWNER TO workflow_app' AS cmd
        FROM pg_tables
        WHERE tableowner = 'postgres' AND schemaname = 'public'
    ) LOOP
        EXECUTE r.cmd;
    END LOOP;
END $$;



-- USER AND ROLES CREATION AND PERMISSIONS
--  workflow_app  (NOLOGIN? No — this IS the DB user, no BYPASSRLS)
--  ├── tenant_user   (no BYPASSRLS)
--  ├── public_user   (no BYPASSRLS)
--  └── superadmin    (BYPASSRLS ✓)

-- 1. Create a dedicated application user
CREATE USER workflow_app WITH PASSWORD 'workflow-password';

-- 2. Create Roles that needs to be used
CREATE ROLE tenant_user;
CREATE ROLE public_user;
CREATE ROLE superadmin;

-- 2. Grant necessary permissions
GRANT CONNECT ON DATABASE "workflow-engine" TO workflow_app;

GRANT USAGE ON SCHEMA public TO workflow_app;
GRANT USAGE ON SCHEMA public TO tenant_user;
GRANT USAGE ON SCHEMA public TO public_user;
GRANT USAGE ON SCHEMA public TO superadmin;


-- 4. Grant DML to both roles
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO workflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO public_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO superadmin;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO workflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tenant_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO public_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO superadmin;

-- 5. Cover tables created by future migrations
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO workflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tenant_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO public_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO superadmin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO workflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tenant_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO public_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO superadmin;

-- 6. Grant the roles the permissions of application user
GRANT tenant_user TO workflow_app;
GRANT public_user TO workflow_app;
GRANT superadmin TO workflow_app;

-- 7. Grant superadmin the BYPASSRLS attribute
ALTER ROLE superadmin BYPASSRLS;








--After this, the privilege map looks like:
--workflow_app  → SELECT, INSERT, UPDATE, DELETE  (table owner, runs migrations)
--tenant_user   → SELECT, INSERT, UPDATE, DELETE  (DML allowed — RLS then filters to tenant)
--public_user   → SELECT, INSERT, UPDATE, DELETE  (DML allowed — RLS then filters to public ops only)

  

-- Quick test user
-- Create new user with SELECT permission only
--CREATE USER test_rls WITH PASSWORD 'test123';
--GRANT CONNECT ON DATABASE "workflow-engine" TO test_rls;
--GRANT USAGE ON SCHEMA public TO test_rls;
--GRANT SELECT ON users TO test_rls;

-- REMOVE USER
--REVOKE ALL PRIVILEGES ON DATABASE "workflow-engine" FROM test_rls;
--REVOKE ALL PRIVILEGES ON SCHEMA public FROM test_rls;
--REVOKE ALL PRIVILEGES ON users FROM test_rls;
--DROP OWNED BY test_rls;
--
--DROP USER test_rls;


SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'users';



--delete from roles ;
--delete from users ;
--delete from tenant_settings ;
--delete from tenants ;



-- Auth Module
select * from users ;
select * from roles ;
select * from user_roles ;
select * from refresh_tokens ;

-- Tenant Module
select * from tenants t ;
select * from tenant_settings ;
select * from tenant_feature_flags ;

-- Workflow Definition Module
select * from workflow_definitions ;
select * from workflow_definition_versions ;
select * from workflow_states ;
select * from workflow_transitions ;
select * from transition_rules ;
select * from instance_form_schemas ;

-- Workflow Execution Module
select * from workflow_instances ;
select * from we_user_shadows ;

-- Audit Module
select * from audit_logs ;

-- select basic details from audit log
select
    id,
    tenant_id,
    actor_id,
    action_type,
    transition_id ,
    from_state ,
    to_state ,
    "comment" ,
    event_id ,
    resource_type ,
    resource_id ,
    occurred_at ,
    payload ,
    created_at
from
    audit_logs ;


-- Notification Module
select * from notification_templates ;
select * from notification_logs ;
select * from webhook_configs ;
select * from webhook_delivery_logs  ;


-- see which user belongs to which role
SELECT 
    u.id         AS user_id,
    u.email,
    u.first_name,
    u.last_name,
    r.name       AS role_name,
    r.id         AS role_id,
    ur.assigned_at
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
WHERE u.tenant_id = '616fec3a-2871-4695-98f3-32f2e4813c19'
ORDER BY u.email, r.name;



-- Delete User from User Table
--delete from users where id = 'e5710deb-fba3-4406-95ff-61c62f6abb4e'


--delete from workflow_definitions ;
--delete from workflow_definition_versions ;
--delete from workflow_states ;
--delete from workflow_transitions ;
--delete from transition_rules ;
--delete from instance_form_schemas ;
--
--delete from workflow_instances ;



-- Run this in your database  
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies 
WHERE tablename = 'users';

-- Run this in your database
SELECT schemaname, tablename, rowsecurity
FROM pg_tables 
WHERE tablename = 'users';

-- In psql, test this sequence:
-- session scoped
SELECT set_config('app.tenant_id', null, false);

SELECT set_config('app.tenant_id', '152c8233-9cb3-4f5d-9cc6-1db4db1beb23', false);
SELECT current_setting('app.tenant_id', true);

SELECT * FROM users ;
--where tenant_id = '152c8233-9cb3-4f5d-9cc6-1db4db1beb23';

set role postgres;
set role workflow_app;

set role tenant_user;
set role public_user;

select current_user, current_role, session_user; 

select * from tenants t ;

SHOW max_connections;


-- Transactionscoped
BEGIN;
SELECT set_config('app.tenant_id', '152c8233-9cb3-4f5d-9cc6-1db4db1beb23', true);
SELECT current_setting('app.tenant_id', true);
SELECT count(*) FROM users;
COMMIT;


-- clear the context
SELECT set_config('app.tenant_id', null, false);
SELECT current_setting('app.tenant_id', true);
select * from users ;



SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'user_roles';

SELECT * FROM pg_policies WHERE tablename = 'user_roles';


-- Test the policy condition manually
SELECT 
  id,
  tenant_id,
  email,
  current_setting('app.tenant_id', true) as setting_value,
  (tenant_id = (current_setting('app.tenant_id'))::uuid) as should_match,
  (tenant_id::text = current_setting('app.tenant_id', true)) as text_match
FROM users 
ORDER BY should_match DESC
LIMIT 10;


















































-- CLEAR ALL THE TABLES IN THE DATABASE
-- Step 1: Disable foreign key checks temporarily
-- Step 2: Get all table names and generate TRUNCATE statements
-- Step 3: Re-enable foreign key checks
--
--SET session_replication_role = replica;
--
--DO $$
--DECLARE
--    table_name TEXT;
--BEGIN
--    FOR table_name IN 
--        SELECT tablename 
--        FROM pg_tables 
--        WHERE schemaname = 'public' 
--        AND tablename != 'migrations'
--    LOOP
--        EXECUTE 'TRUNCATE TABLE "' || table_name || '" RESTART IDENTITY CASCADE;';
--        RAISE NOTICE 'Cleared table: %', table_name;
--    END LOOP;
--END $$;
--
--SET session_replication_role = DEFAULT;



-- DROP ALL THE TABLES
-- ============================
--SET session_replication_role = replica;
--
--DO $$
--DECLARE
--    table_name TEXT;
--BEGIN
--    FOR table_name IN 
--        SELECT tablename 
--        FROM pg_tables 
--        WHERE schemaname = 'public' 
--        AND tablename != 'migrations'
--    LOOP
--        EXECUTE 'DROP TABLE "' || table_name || '" CASCADE';
--        RAISE NOTICE 'Cleared table: %', table_name;
--    END LOOP;
--END $$;
--
--SET session_replication_role = DEFAULT;








