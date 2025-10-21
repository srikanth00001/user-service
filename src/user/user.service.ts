import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { Role } from '../role/entities/role.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
  ) {}

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

  async getUsers() {
    return this.userRepository.find({ relations: ['role'] });
  }

  async getUser(id: string) {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['role'] });
    if (!user) {
      throw new BadRequestException(`User with ID ${id} not found`);
    }
    return user;
  }

  async updateUser(id: string, userData: any, passwordAlreadyHashed = false) {
    console.log(`Updating user ${id} with data: ${JSON.stringify(userData)}`);
    const user = await this.getUser(id);

    if (userData.roleId) {
      const role = await this.roleRepository.findOne({ where: { id: userData.roleId } });
      if (!role) {
        throw new BadRequestException(`Role with ID ${userData.roleId} does not exist in lead-crm database`);
      }
      userData.role = role;
    }

    if (userData.password && !passwordAlreadyHashed) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }

    const { passwordAlreadyHashed: _, ...updateData } = userData;
    console.log(`Updating user ${id} with fields: ${JSON.stringify(updateData)}`);
    await this.userRepository.update(id, updateData);
    const updatedUser = await this.getUser(id);
    console.log(`User after update: ${JSON.stringify(updatedUser)}`);
    return updatedUser;
  }

  async deleteUser(id: string) {
    const user = await this.getUser(id);
    await this.userRepository.delete(id);
    return { message: 'User deleted successfully' };
  }

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

  async saveUser(user: any) {
    const { firstName, lastName, email, password, mobileNumber, address, city, state, country, role, emailVerificationToken } = user;

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
    });

    return this.userRepository.save(userEntity);
  }

  async findRoleById(id: string) {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) {
      throw new BadRequestException(`Role with ID ${id} does not exist in lead-crm database`);
    }
    return role;
  }

  async findRoleByName(name: string) {
    const role = await this.roleRepository.findOne({ where: { name } });
    if (!role) {
      throw new BadRequestException(`Role with name ${name} does not exist in lead-crm database`);
    }
    return role;
  }
}