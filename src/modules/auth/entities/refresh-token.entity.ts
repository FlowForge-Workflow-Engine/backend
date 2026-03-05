import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Refresh token store — standalone entity with explicit tenantId + userId.
 * Does NOT extend BaseEntity — no updatedAt needed; tokens are append-only.
 * tokenHash is stored (never the raw token), unique to allow O(1) lookup.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  /** SHA-256 hash of the raw refresh token (raw token sent to client, never stored) */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, name: 'token_hash' })
  tokenHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  /** Null = active; non-null = revoked at this time */
  @Column({ type: 'timestamptz', nullable: true, name: 'revoked_at' })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

