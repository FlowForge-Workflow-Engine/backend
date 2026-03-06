import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1772830603496 implements MigrationInterface {
    name = 'Migration1772830603496'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."workflow_instances_status_enum" AS ENUM('active', 'completed', 'cancelled')
        `);
        await queryRunner.query(`
            CREATE TABLE "workflow_instances" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workflow_definition_id" uuid NOT NULL,
                "definition_version" integer NOT NULL,
                "current_state_id" uuid NOT NULL,
                "current_state_name" character varying(100) NOT NULL,
                "payload" jsonb NOT NULL DEFAULT '{}',
                "status" "public"."workflow_instances_status_enum" NOT NULL DEFAULT 'active',
                "version" integer NOT NULL DEFAULT '1',
                "created_by" uuid NOT NULL,
                "completed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_90cc94e44ff8b7b7869f50e4fc4" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_b1d9f2a0de1a1fe0e5a40a2e62" ON "workflow_instances" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_315b3ee1334b0c8e4313dc502e" ON "workflow_instances" ("tenant_id", "workflow_definition_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_546667131c795ca3bf0e0d2393" ON "workflow_instances" ("tenant_id", "status")
        `);
        await queryRunner.query(`
            CREATE TABLE "we_user_shadows" (
                "id" uuid NOT NULL,
                "tenant_id" uuid NOT NULL,
                "email" character varying(255) NOT NULL,
                "full_name" character varying(255) NOT NULL,
                "roles" character varying array NOT NULL DEFAULT '{}',
                "is_active" boolean NOT NULL DEFAULT true,
                "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_593b297350aae3122f4b68f5d17" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_fc9cd3dbae92e02c23d8912f67" ON "we_user_shadows" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "workflow_transitions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workflow_definition_id" uuid NOT NULL,
                "name" character varying(100) NOT NULL,
                "from_state_id" uuid NOT NULL,
                "to_state_id" uuid NOT NULL,
                "allowed_role_ids" uuid array NOT NULL DEFAULT '{}',
                "requires_comment" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_edda0b5bb7b13fc6681c56764af" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_2504c8b3ba4e07b13986fd7904" ON "workflow_transitions" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "workflow_states" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workflow_definition_id" uuid NOT NULL,
                "name" character varying(100) NOT NULL,
                "description" text,
                "is_initial" boolean NOT NULL DEFAULT false,
                "is_terminal" boolean NOT NULL DEFAULT false,
                "position_x" double precision,
                "position_y" double precision,
                "metadata" jsonb,
                CONSTRAINT "PK_d495dad7ebe116fb8f989f1e144" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_96d9b66e0f793921955157dd7f" ON "workflow_states" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."workflow_definitions_status_enum" AS ENUM('draft', 'published', 'deprecated')
        `);
        await queryRunner.query(`
            CREATE TABLE "workflow_definitions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying(255) NOT NULL,
                "description" text,
                "current_version" integer NOT NULL DEFAULT '1',
                "status" "public"."workflow_definitions_status_enum" NOT NULL DEFAULT 'draft',
                "created_by" uuid NOT NULL,
                CONSTRAINT "PK_4f92fadfc5fb722f080ceaec272" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_62bad1658c553173f580e8b813" ON "workflow_definitions" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "workflow_definition_versions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workflow_definition_id" uuid NOT NULL,
                "version_number" integer NOT NULL,
                "snapshot" jsonb NOT NULL,
                "is_active" boolean NOT NULL DEFAULT false,
                "published_by" uuid NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_68c6710e79b6f60d1be76c0ba0b" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_dfd1ed71751f51e847325be65c" ON "workflow_definition_versions" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_d04275c2688d4002adfbbc1637" ON "workflow_definition_versions" ("workflow_definition_id", "version_number")
        `);
        await queryRunner.query(`
            CREATE TABLE "transition_rules" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "transition_id" uuid NOT NULL,
                "rule_name" character varying(100) NOT NULL,
                "rule_definition" jsonb NOT NULL,
                "evaluation_order" integer NOT NULL DEFAULT '0',
                CONSTRAINT "PK_0a45ca127cad0dfa43b1b2670fe" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_2ff285f33c1b023ba1e2799e6b" ON "transition_rules" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "instance_form_schemas" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "workflow_definition_id" uuid NOT NULL,
                "schema" jsonb NOT NULL,
                CONSTRAINT "PK_481cc5b264ca983411c3f7eab0e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_171f0512f2c0b39ef72c941a0d" ON "instance_form_schemas" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_2d7c912f10ed86a3331a544e50" ON "instance_form_schemas" ("workflow_definition_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."tenant_plan_enum" AS ENUM('free', 'pro', 'enterprise')
        `);
        await queryRunner.query(`
            CREATE TABLE "tenants" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying(255) NOT NULL,
                "slug" character varying(100) NOT NULL,
                "plan" "public"."tenant_plan_enum" NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"),
                CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "tenant_settings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "maxWorkflowDefinitions" integer NOT NULL DEFAULT '10',
                "maxUsers" integer NOT NULL DEFAULT '50',
                "branding" jsonb,
                "timezone" character varying(50) NOT NULL DEFAULT 'UTC',
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_a6abc1c3ed0df635955fc852f1c" UNIQUE ("tenant_id"),
                CONSTRAINT "REL_a6abc1c3ed0df635955fc852f1" UNIQUE ("tenant_id"),
                CONSTRAINT "PK_69225c0ca64bcbbf9af8a217043" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_a6abc1c3ed0df635955fc852f1" ON "tenant_settings" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "tenant_feature_flags" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "flagKey" character varying(100) NOT NULL,
                "isEnabled" boolean NOT NULL DEFAULT false,
                "config" jsonb,
                CONSTRAINT "UQ_732a30e3f4ec0d554e1de500ad6" UNIQUE ("tenant_id", "flagKey"),
                CONSTRAINT "PK_662d67fb0742549eca25ce588ed" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_16a1f6c44ac76e14dd44d821fd" ON "tenant_feature_flags" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "webhook_delivery_logs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "webhook_config_id" uuid NOT NULL,
                "event_name" character varying(100) NOT NULL,
                "payload" jsonb NOT NULL,
                "http_status" integer,
                "response_body" text,
                "attempt_number" integer NOT NULL DEFAULT '1',
                "delivered_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_0e3b1d3f1b9b79d4a7ad0b92b84" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_621e74008288050a6c8112d972" ON "webhook_delivery_logs" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "webhook_configs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying(100) NOT NULL,
                "url" text NOT NULL,
                "secret" character varying(255) NOT NULL,
                "event_triggers" character varying array NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                CONSTRAINT "PK_b6d2d3606e01c28d476122185b6" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9c3f75953455671406b1eca079" ON "webhook_configs" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notification_templates_channel_enum" AS ENUM('email', 'webhook')
        `);
        await queryRunner.query(`
            CREATE TABLE "notification_templates" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "event_trigger" character varying(100) NOT NULL,
                "channel" "public"."notification_templates_channel_enum" NOT NULL,
                "subject_template" text,
                "body_template" text NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                CONSTRAINT "PK_76f0fc48b8d057d2ae7f3a2848a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e5a9758b51fe8568e19eea9673" ON "notification_templates" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notification_logs_channel_enum" AS ENUM('email', 'webhook')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."notification_logs_status_enum" AS ENUM('pending', 'sent', 'failed')
        `);
        await queryRunner.query(`
            CREATE TABLE "notification_logs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "template_id" uuid NOT NULL,
                "recipient_user_id" uuid,
                "recipient_email" character varying(255) NOT NULL,
                "channel" "public"."notification_logs_channel_enum" NOT NULL,
                "status" "public"."notification_logs_status_enum" NOT NULL DEFAULT 'pending',
                "retry_count" integer NOT NULL DEFAULT '0',
                "error_message" text,
                "sent_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_19c524e644cdeaebfcffc284871" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_fe6690289c5e319b2ac0d809d7" ON "notification_logs" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "roles" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying(100) NOT NULL,
                "description" character varying(255),
                "is_system_role" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e59a01f4fe46ebbece575d9a0f" ON "roles" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_c555146b304b5f51a7de6e18de" ON "roles" ("tenant_id", "name")
        `);
        await queryRunner.query(`
            CREATE TABLE "user_roles" (
                "user_id" uuid NOT NULL,
                "role_id" uuid NOT NULL,
                "tenant_id" uuid NOT NULL,
                "assigned_by" uuid,
                "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_23ed6f04fe43066df08379fd034" PRIMARY KEY ("user_id", "role_id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_156cd3e5710ec8c0a4bbe7865f" ON "user_roles" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_23ed6f04fe43066df08379fd03" ON "user_roles" ("user_id", "role_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "email" character varying(255) NOT NULL,
                "password_hash" character varying(255) NOT NULL,
                "first_name" character varying(100) NOT NULL,
                "last_name" character varying(100) NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "is_email_verified" boolean NOT NULL DEFAULT false,
                "last_login_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_109638590074998bb72a2f2cf0" ON "users" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e9f4c2efab52114c4e99e28efb" ON "users" ("tenant_id", "email")
        `);
        await queryRunner.query(`
            CREATE TABLE "refresh_tokens" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "token_hash" character varying(255) NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revoked_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_5a8595644958acb2c80e175778" ON "refresh_tokens" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3ddc983c5f7bcf132fd8732c3f" ON "refresh_tokens" ("user_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens" ("token_hash")
        `);
        await queryRunner.query(`
            CREATE TABLE "permissions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "resource" character varying(100) NOT NULL,
                "action" character varying(100) NOT NULL,
                "description" character varying(255),
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."audit_logs_action_type_enum" AS ENUM(
                'instance_created',
                'transition_executed',
                'instance_completed',
                'instance_cancelled',
                'user_created',
                'user_deactivated',
                'user_roles_updated',
                'tenant_created',
                'tenant_deactivated',
                'tenant_plan_updated',
                'workflow_definition_published',
                'workflow_definition_deprecated'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "audit_logs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "instance_id" uuid,
                "actor_id" uuid,
                "actor_email" character varying(255),
                "actor_role" character varying(100),
                "action_type" "public"."audit_logs_action_type_enum" NOT NULL,
                "transition_id" uuid,
                "transition_name" character varying(100),
                "from_state" character varying(100),
                "to_state" character varying(100),
                "comment" text,
                "ip_address" character varying(45),
                "user_agent" text,
                "event_id" uuid NOT NULL,
                "resource_type" character varying(100) NOT NULL,
                "resource_id" uuid NOT NULL,
                "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "payload" jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_a3d19b5d77683e3c133f298d751" UNIQUE ("event_id"),
                CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_6f18d459490bb48923b1f40bdb" ON "audit_logs" ("tenant_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_68f97a33911429fff3232bd291" ON "audit_logs" ("instance_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_898d14750b88319b89b1ab66cd" ON "audit_logs" ("tenant_id", "created_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ef8394416891691cef1bb4c4e7" ON "audit_logs" ("tenant_id", "instance_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "tenant_settings"
            ADD CONSTRAINT "FK_a6abc1c3ed0df635955fc852f1c" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "user_roles"
            ADD CONSTRAINT "FK_87b8888186ca9769c960e926870" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "user_roles"
            ADD CONSTRAINT "FK_b23c65e50a758245a33ee35fda1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "user_roles" DROP CONSTRAINT "FK_b23c65e50a758245a33ee35fda1"
        `);
        await queryRunner.query(`
            ALTER TABLE "user_roles" DROP CONSTRAINT "FK_87b8888186ca9769c960e926870"
        `);
        await queryRunner.query(`
            ALTER TABLE "tenant_settings" DROP CONSTRAINT "FK_a6abc1c3ed0df635955fc852f1c"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_ef8394416891691cef1bb4c4e7"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_898d14750b88319b89b1ab66cd"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_68f97a33911429fff3232bd291"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_6f18d459490bb48923b1f40bdb"
        `);
        await queryRunner.query(`
            DROP TABLE "audit_logs"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."audit_logs_action_type_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "permissions"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3ddc983c5f7bcf132fd8732c3f"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_5a8595644958acb2c80e175778"
        `);
        await queryRunner.query(`
            DROP TABLE "refresh_tokens"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e9f4c2efab52114c4e99e28efb"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_109638590074998bb72a2f2cf0"
        `);
        await queryRunner.query(`
            DROP TABLE "users"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_23ed6f04fe43066df08379fd03"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_156cd3e5710ec8c0a4bbe7865f"
        `);
        await queryRunner.query(`
            DROP TABLE "user_roles"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c555146b304b5f51a7de6e18de"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e59a01f4fe46ebbece575d9a0f"
        `);
        await queryRunner.query(`
            DROP TABLE "roles"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_fe6690289c5e319b2ac0d809d7"
        `);
        await queryRunner.query(`
            DROP TABLE "notification_logs"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notification_logs_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notification_logs_channel_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e5a9758b51fe8568e19eea9673"
        `);
        await queryRunner.query(`
            DROP TABLE "notification_templates"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."notification_templates_channel_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9c3f75953455671406b1eca079"
        `);
        await queryRunner.query(`
            DROP TABLE "webhook_configs"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_621e74008288050a6c8112d972"
        `);
        await queryRunner.query(`
            DROP TABLE "webhook_delivery_logs"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_16a1f6c44ac76e14dd44d821fd"
        `);
        await queryRunner.query(`
            DROP TABLE "tenant_feature_flags"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a6abc1c3ed0df635955fc852f1"
        `);
        await queryRunner.query(`
            DROP TABLE "tenant_settings"
        `);
        await queryRunner.query(`
            DROP TABLE "tenants"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."tenant_plan_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_2d7c912f10ed86a3331a544e50"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_171f0512f2c0b39ef72c941a0d"
        `);
        await queryRunner.query(`
            DROP TABLE "instance_form_schemas"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_2ff285f33c1b023ba1e2799e6b"
        `);
        await queryRunner.query(`
            DROP TABLE "transition_rules"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_d04275c2688d4002adfbbc1637"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_dfd1ed71751f51e847325be65c"
        `);
        await queryRunner.query(`
            DROP TABLE "workflow_definition_versions"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_62bad1658c553173f580e8b813"
        `);
        await queryRunner.query(`
            DROP TABLE "workflow_definitions"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."workflow_definitions_status_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_96d9b66e0f793921955157dd7f"
        `);
        await queryRunner.query(`
            DROP TABLE "workflow_states"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_2504c8b3ba4e07b13986fd7904"
        `);
        await queryRunner.query(`
            DROP TABLE "workflow_transitions"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_fc9cd3dbae92e02c23d8912f67"
        `);
        await queryRunner.query(`
            DROP TABLE "we_user_shadows"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_546667131c795ca3bf0e0d2393"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_315b3ee1334b0c8e4313dc502e"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_b1d9f2a0de1a1fe0e5a40a2e62"
        `);
        await queryRunner.query(`
            DROP TABLE "workflow_instances"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."workflow_instances_status_enum"
        `);
    }

}
