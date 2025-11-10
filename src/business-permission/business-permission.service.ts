import { Injectable, BadRequestException } from '@nestjs/common';
import { BusinessPermission } from './entities/business-permission.entity';
import { BusinessRole } from '../business-role/entities/business-role.entity';
import { Repository } from 'typeorm';
import { DatabaseManager } from 'src/common/database/database.manager';

@Injectable()
export class BusinessPermissionService {
  constructor(private readonly dbManager: DatabaseManager) {}

  private async getRepos(tenantKey: string): Promise<{
  permRepo: Repository<BusinessPermission>;
  roleRepo: Repository<BusinessRole>;
}> {
  const conn = await this.dbManager.getOrCreateTenantConnection(tenantKey);
  return {
    permRepo: conn.getRepository(BusinessPermission),
    roleRepo: conn.getRepository(BusinessRole),
  };
}


  async create(roleId: string, permissions: Record<string, string[]>, tenantKey: string) {
    const { permRepo, roleRepo } = await this.getRepos(tenantKey);

    const role = await roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new BadRequestException('Role not found');

    let permission = await permRepo.findOne({ where: { role: { id: roleId } } });
    if (permission) {
      permission.permissions = permissions;
    } else {
      permission = permRepo.create({ role, permissions });
    }

    return permRepo.save(permission);
  }

  async update(roleId: string, permissions: Record<string, string[]>, tenantKey: string) {
    return this.create(roleId, permissions, tenantKey);
  }

  async getAll(tenantKey: string) {
    const { permRepo } = await this.getRepos(tenantKey);
    return permRepo.find({ relations: ['role'] });
  }
}
