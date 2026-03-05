import { Column, CreateDateColumn, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * Abstract base entity. All tenant-scoped entities must extend this.
 * Provides: id (UUID PK), tenantId (UUID indexed), createdAt, updatedAt.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid", nullable: false, name: "tenant_id" })
  tenantId: string;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt: Date;
}
