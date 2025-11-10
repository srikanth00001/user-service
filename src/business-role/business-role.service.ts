import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseManager } from 'src/common/database/database.manager';
import { BusinessRole } from './entities/business-role.entity';

@Injectable()
export class BusinessRoleService {
  constructor(private readonly dbManager: DatabaseManager) {}

  async create(name: string, tenantKey: string) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(BusinessRole);

    const exists = await repo.findOne({ where: { name, tenantKey } });
    if (exists) throw new ConflictException('Role already exists');

    const role = repo.create({ name, tenantKey });
    return repo.save(role);
  }

  async getAll(tenantKey: string) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(BusinessRole);
    return repo.find({ where: { tenantKey }, order: { createdAt: 'ASC' } });
  }

  async getOne(id: string, tenantKey: string) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(BusinessRole);

    const role = await repo.findOne({ where: { id, tenantKey } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async update(id: string, dto: { name?: string; active?: boolean }, tenantKey: string) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(BusinessRole);

    const role = await repo.findOne({ where: { id, tenantKey } });
    if (!role) throw new NotFoundException('Role not found');

    if (dto.name && dto.name !== role.name) {
      const duplicate = await repo.findOne({ where: { name: dto.name, tenantKey } });
      if (duplicate) throw new ConflictException('Role name already exists');
      role.name = dto.name;
    }

    if (dto.active !== undefined) role.active = dto.active;

    return repo.save(role);
  }

  async delete(id: string, tenantKey: string) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(BusinessRole);

    const role = await repo.findOne({ where: { id, tenantKey } });
    if (!role) throw new NotFoundException('Role not found');

    await repo.remove(role);
    return { success: true, message: 'Role deleted successfully' };
  }
}
