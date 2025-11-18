import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseManager } from 'src/common/database/database.manager';
import { BusinessUser } from './entities/business-user.entity';
import { BusinessRole } from 'src/business-role/entities/business-role.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class BusinessUserService {
   constructor(
    @InjectRepository(BusinessUser)
    private readonly userRepo: Repository<BusinessUser>,

    @InjectRepository(BusinessRole)
    private readonly roleRepo: Repository<BusinessRole>,

    private readonly dbManager: DatabaseManager
  )  {}

  async create(dto: any, tenantKey: string, createdBy?: string) {
    if (!dto?.email) throw new BadRequestException('Email is required');
    if (!dto?.password) throw new BadRequestException('Password is required');
    if (!dto?.roleId) throw new BadRequestException('RoleId is required');

    const exists = await this.userRepo.findOne({
      where: [{ email: dto.email }, { mobileNumber: dto.mobileNumber }],
    });
    if (exists) throw new ConflictException('User already exists in your organization');

    const role = await this.roleRepo.findOne({ where: { id: dto.roleId, tenantKey } });
    if (!role) throw new BadRequestException('Role not found');

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = this.userRepo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      password: hashed,
      mobileNumber: dto.mobileNumber,
      address: dto.address,
      city: dto.city,
      state: dto.state,
      country: dto.country,
      tenantKey,
      role,
      createdBy,
      emailVerificationToken: uuidv4(),
    });

    return this.userRepo.save(user);
  }

  async findByEmail(email: string) {
    return this.userRepo.findOne({ where: { email }, relations: ['role'] });
  }

  async findById(tenantKey: string, id: string): Promise<BusinessUser | null> {
  // If tenantKey is provided, use tenant connection
  if (tenantKey) {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = dataSource.getRepository(BusinessUser);
    return repo.findOne({ where: { id }, relations: ['role'] });
  }
  // fallback for default
  return this.userRepo.findOne({ where: { id }, relations: ['role'] });
}


  async getTeam(tenantKey: string) {
    return this.userRepo.find({
      where: { tenantKey },
      relations: ['role'],
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, dto: any, tenantKey: string) {
    const user = await this.userRepo.findOne({ where: { id, tenantKey }, relations: ['role'] });
    if (!user) throw new BadRequestException('User not found');

    if (dto.roleId) {
      const role = await this.roleRepo.findOne({ where: { id: dto.roleId, tenantKey } });
      if (!role) throw new BadRequestException('Role not found');
      user.role = role;
    }

    if (dto.password) {
      user.password = await bcrypt.hash(dto.password, 10);
    }

    Object.assign(user, dto);
    return this.userRepo.save(user);
  }

  async delete(id: string, tenantKey: string) {
    const user = await this.userRepo.findOne({ where: { id, tenantKey } });
    if (!user) throw new BadRequestException('User not found');
    await this.userRepo.softRemove(user);
    return { message: 'User deleted successfully' };
  }
}
