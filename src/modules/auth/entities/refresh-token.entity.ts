import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Refresh token store — standalone entity with explicit tenantId + userId.
 * Does NOT extend BaseEntity — no updatedAt needed; tokens are append-only.
 * tokenHash is stored (never the raw token), unique to allow O(1) lookup.
 */
@Entity("refresh_tokens")
export class RefreshToken {
  /** Primary key - unique identifier for each refresh token record */
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** Tenant isolation - ensures tokens are scoped to specific tenant */
  @Index()
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId: string;

  /** Foreign key to user - links token to specific user for authentication */
  @Index()
  @Column({ type: "uuid", name: "user_id" })
  userId: string;

  /** SHA-256 hash of the raw refresh token (raw token sent to client, never stored) - secure token storage */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 255, name: "token_hash" })
  tokenHash: string;

  /** Token expiration timestamp - enforces token lifecycle management */
  @Column({ type: "timestamptz", name: "expires_at" })
  expiresAt: Date;

  /** Null = active; non-null = revoked at this time - tracks token revocation for security */
  @Column({ type: "timestamptz", nullable: true, name: "revoked_at" })
  revokedAt: Date | null;

  /** Timestamp when token was created - tracks token issuance for audit */
  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
}
