import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findByEmailAndTenant(email: string, tenantId: string): Promise<User | null> {
    return this.repo.findOne({ where: { email, tenantId } });
  }

  findByIdAndTenant(id: string, tenantId: string): Promise<User | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  findByTenantId(tenantId: string): Promise<User[]> {
    return this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
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
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.userRoles', 'ur')
      .leftJoinAndSelect('ur.role', 'r')
      .where('u.id = :id AND u.tenantId = :tenantId', { id, tenantId })
      .getOne();
  }

  create(data: Partial<User>): User {
    return this.repo.create(data);
  }

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }
}

