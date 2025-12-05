import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { MessagePattern } from '@nestjs/microservices';
import { User } from './entities/user.entity';
import { Role } from '../role/entities/role.entity';
import { BusinessUser } from 'src/business-user/entities/business-user.entity';
import { BusinessRole } from 'src/business-role/entities/business-role.entity';
import { BusinessPermission } from 'src/business-permission/entities/business-permission.entity';
import { DatabaseManager } from 'src/common/database/database.manager';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    private readonly dbManager: DatabaseManager,
  ) { }

  // 🔹 Create new user in main (lead-crm) DB
  async createUser(userData: any) {
    const { firstName, lastName, email, password, mobileNumber, address, city, state, country, roleId } = userData;

    const existingUser = await this.userRepository.findOne({ where: [{ email }, { mobileNumber }] });
    if (existingUser) {
      throw new ConflictException('Email or mobile number already exists');
    }

    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role) {
      throw new BadRequestException(`Role with ID ${roleId} does not exist in lead-crm database`);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      firstName,
      lastName: lastName || null,
      email,
      password: hashedPassword,
      mobileNumber,
      address,
      city,
      state,
      country,
      role,
    });

    return this.userRepository.save(user);
  }

  // 🔹 Fetch all users
  async getUsers() {
    return this.userRepository.find({ relations: ['role'] });
  }

  // 🔹 Fetch single user
  async getUser(id: string) {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['role'] });
    if (!user) {
      throw new BadRequestException(`User with ID ${id} not found`);
    }
    return user;
  }

  // 🔹 Update user
  async updateUser(id: string, userData: any, passwordAlreadyHashed = false) {
    const user = await this.getUser(id);

    // Handle role update if provided
    if (userData.roleId !== undefined) {
      if (!userData.roleId) throw new BadRequestException('roleId cannot be empty');
      const role = await this.roleRepository.findOne({ where: { id: userData.roleId } });
      if (!role) throw new BadRequestException(`Role with ID ${userData.roleId} not found`);
      userData.role = role;
      delete userData.roleId;
    }

    if (userData.password && !passwordAlreadyHashed) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }

    await this.userRepository.update(id, userData);
    return this.getUser(id);
  }

  // 🔹 Delete user
  async deleteUser(id: string) {
    await this.getUser(id);
    await this.userRepository.delete(id);
    return { message: 'User deleted successfully' };
  }

  // 🔹 Find user in main DB
  async findUserByEmail(email: string) {
    return this.userRepository.findOne({ where: { email }, relations: ['role'] });
  }

  async findUserByEmailOrMobile({ email, mobileNumber }: { email: string; mobileNumber: string }) {
    return this.userRepository.findOne({ where: [{ email }, { mobileNumber }], relations: ['role'] });
  }

  async findUserById(id: string) {
    return this.getUser(id);
  }

  async findUserByEmailVerificationToken(token: string) {
    return this.userRepository.findOne({ where: { emailVerificationToken: token }, relations: ['role'] });
  }

  async findUserByResetToken(resetToken: string) {
    return this.userRepository.findOne({ where: { resetToken }, relations: ['role'] });
  }

  // 🔹 Save user in main DB
  async saveUser(user: any) {
    const {
      firstName,
      lastName,
      email,
      password,
      mobileNumber,
      address,
      city,
      state,
      country,
      role,
      emailVerificationToken,
      tenantKey,
    } = user;

    const existingUser = await this.userRepository.findOne({ where: [{ email }, { mobileNumber }] });
    if (existingUser) {
      throw new ConflictException('Email or mobile number already exists');
    }

    const roleEntity = await this.roleRepository.findOne({ where: { id: role.id } });
    if (!roleEntity) {
      throw new BadRequestException(`Role with ID ${role.id} does not exist in lead-crm database`);
    }

    const userEntity = this.userRepository.create({
      firstName,
      lastName,
      email,
      password,
      mobileNumber,
      address,
      city,
      state,
      country,
      role: roleEntity,
      emailVerificationToken,
      tenantKey,
    });

    return this.userRepository.save(userEntity);
  }

  // ✅ FIXED: Proper handler for microservice message
  @MessagePattern({ cmd: 'findBusinessUserByEmail' })
  async findBusinessUserByEmailHandler(email: string) {
    return this.findBusinessUserByEmail(email);
  }

  // 🔹 Find user inside tenant DB
  async findBusinessUserByEmail(email: string): Promise<BusinessUser | null> {
    const domain = email.split('@')[1]?.toLowerCase().replace(/\./g, '_');
    if (!domain) return null;

    const tenantKey = domain;

    try {
      const tenantDataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
      const businessUserRepo = tenantDataSource.getRepository(BusinessUser);

      const user = await businessUserRepo.findOne({
        where: { email },
        relations: ['role'],
      });

      return user || null;
    } catch (error) {
      console.warn(`Error fetching business user for ${email} in ${tenantKey}: ${error.message}`);
      return null;
    }
  }

  // 🔹 Find business user by ID inside tenant DB  
  async findBusinessUserById(id: string): Promise<BusinessUser | null> {
    // We need to iterate through all tenant connections to find the user
    // This is because we don't know which tenant the user belongs to from just the ID
    const connections = Array.from(this.dbManager['connections'].values());

    for (const { dataSource } of connections) {
      try {
        const businessUserRepo = dataSource.getRepository(BusinessUser);
        const user = await businessUserRepo.findOne({
          where: { id },
          relations: ['role'],
        });

        if (user) return user;
      } catch (error) {
        // Skip this tenant if there's an error
        continue;
      }
    }

    return null;
  }

  // 🔹 Seed tenant DB (roles + permissions)
  @MessagePattern({ cmd: 'seedBusinessTenant' })
  async seedBusinessTenant(data: { tenantKey: string; ownerEmail: string }) {
    const { tenantKey } = data;
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);

    const roleRepo = ds.getRepository(BusinessRole);
    const permRepo = ds.getRepository(BusinessPermission);

    const roles = [
      { name: 'Admin', perms: { '*': ['*'] } },
      { name: 'Manager', perms: { leads: ['view', 'edit'], campaigns: ['view'] } },
      { name: 'Staff', perms: { leads: ['view'] } },
    ];

    for (const r of roles) {
      let role = await roleRepo.findOne({ where: { name: r.name, tenantKey } });
      if (!role) {
        role = await roleRepo.save({ name: r.name, tenantKey });
        await permRepo.save({ role, menu_actions: r.perms });
      }
    }

    return { success: true, tenantKey };
  }

  // 🔹 Find role helpers
  async findRoleById(id: string) {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) throw new BadRequestException(`Role with ID ${id} not found`);
    return role;
  }

  async findRoleByName(name: string) {
    const role = await this.roleRepository.findOne({ where: { name } });
    if (!role) throw new BadRequestException(`Role with name ${name} not found`);
    return role;
  }

  // 🔹 Helper (optional)
  private extractDomain(email: string): string | null {
    const match = email.match(/@([^.]+)\./);
    return match ? match[1] : null;
  }
}
