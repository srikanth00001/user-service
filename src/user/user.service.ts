import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { Role } from 'src/role/entities/role.entity';

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
      throw new BadRequestException('Invalid role ID');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      firstName,
      lastName,
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
      throw new BadRequestException('User not found');
    }
    return user;
  }

 async updateUser(id: string, userData: any, passwordAlreadyHashed = false) {
  const user = await this.getUser(id);

  if (userData.roleId) {
    const role = await this.roleRepository.findOne({ where: { id: userData.roleId } });
    if (!role) {
      throw new BadRequestException('Invalid role ID');
    }
    userData.role = role;
  }

  if (userData.password && !passwordAlreadyHashed) {
    userData.password = await bcrypt.hash(userData.password, 10);
  }

  // Remove keys that do not exist in the entity
  const { passwordAlreadyHashed: _, ...updateData } = userData;

  await this.userRepository.update(id, updateData);
  return this.getUser(id);
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
    return this.userRepository.save(user);
  }

 async findRoleById(id: string) {
  const role = await this.roleRepository.findOne({ where: { id } });
  if (!role) {
    throw new BadRequestException('Role not found');
  }
  return role;
}

  async findRoleByName(name: string) {
    return this.roleRepository.findOne({ where: { name } });
  }
}