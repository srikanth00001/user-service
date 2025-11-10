import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessUser } from './entities/business-user.entity';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { BusinessRole } from 'src/business-role/entities/business-role.entity';

@Injectable()
export class BusinessUserService {
  constructor(
    @InjectRepository(BusinessUser)
    private businessUserRepo: Repository<BusinessUser>,
    @InjectRepository(BusinessRole)
    private roleRepo: Repository<BusinessRole>,
  ) {}

  async create(dto: any, tenantKey: string, createdBy?: string) {
    if (!dto) throw new BadRequestException('Invalid request data');
    if (!dto.email) throw new BadRequestException('Email is required');
    if (!dto.password) throw new BadRequestException('Password is required');
    if (!dto.roleId) throw new BadRequestException('RoleId is required');

    const exists = await this.businessUserRepo.findOne({
      where: [{ email: dto.email }, { mobileNumber: dto.mobileNumber }],
    });
    if (exists)
      throw new ConflictException('User already exists in your organization');

    const role = await this.roleRepo.findOne({ where: { id: dto.roleId, tenantKey } });
    if (!role) throw new BadRequestException('Role not found');

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = this.businessUserRepo.create({
  firstName: dto.firstName,
  lastName: dto.lastName,          // ✅ not dto.lastName || null
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


    return this.businessUserRepo.save(user);
  }

  async findByEmail(email: string) {
    return this.businessUserRepo.findOne({ where: { email }, relations: ['role'] });
  }

  async getTeam(tenantKey: string) {
    return this.businessUserRepo.find({
      where: { tenantKey },
      relations: ['role'],
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, dto: any, tenantKey: string) {
    const user = await this.businessUserRepo.findOne({ where: { id, tenantKey } });
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
    return this.businessUserRepo.save(user);
  }

  async delete(id: string, tenantKey: string) {
    const user = await this.businessUserRepo.findOne({ where: { id, tenantKey } });
    if (!user) throw new BadRequestException('User not found');
    await this.businessUserRepo.softRemove(user);
    return { message: 'User deleted successfully' };
  }
}
