import { Controller, Post, Body, Get, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Connection } from 'typeorm';
import { DatabaseManagementService } from './database-management.service';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly databaseManagementService: DatabaseManagementService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createUser(@Body() userData: any) {
    return this.userService.createUser(userData);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getUsers() {
    return this.userService.getUsers();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.userService.getUser(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateUser(@Param('id') id: string, @Body() userData: any) {
    return this.userService.updateUser(id, userData);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    return this.userService.deleteUser(id);
  }

  @MessagePattern({ cmd: 'findUserByEmail' })
  async findUserByEmail(email: string) {
    return this.userService.findUserByEmail(email);
  }

  @MessagePattern({ cmd: 'findUserByEmailOrMobile' })
  async findUserByEmailOrMobile(data: { email: string; mobileNumber: string }) {
    return this.userService.findUserByEmailOrMobile(data);
  }

  @MessagePattern({ cmd: 'findUserById' })
  async findUserById(id: string) {
    return this.userService.findUserById(id);
  }

  @MessagePattern({ cmd: 'findUserByEmailVerificationToken' })
  async findUserByEmailVerificationToken(token: string) {
    return this.userService.findUserByEmailVerificationToken(token);
  }

  @MessagePattern({ cmd: 'findUserByResetToken' })
  async findUserByResetToken(resetToken: string) {
    return this.userService.findUserByResetToken(resetToken);
  }

  @MessagePattern({ cmd: 'saveUser' })
  async saveUser(user: any) {
    return this.userService.saveUser(user);
  }

  @MessagePattern({ cmd: 'findRoleById' })
  async findRoleById(id: string) {
    return this.userService.findRoleById(id);
  }

  @MessagePattern({ cmd: 'updateUserByMicroservice' })
  async updateUserByMicroservice(data: { id: string; passwordAlreadyHashed?: boolean; database?: string; [key: string]: any }) {
    if (data.database) {
      const connection = await this.databaseManagementService.getConnection(data.database);
      await this.userService.setConnection(connection);
    }
    return this.userService.updateUser(data.id, data, data.passwordAlreadyHashed);
  }

  @MessagePattern({ cmd: 'findRoleByName' })
  async findRoleByName(name: string) {
    return this.userService.findRoleByName(name);
  }

  @MessagePattern({ cmd: 'updateDatabaseConnection' })
  async updateDatabaseConnection(data: { database: string }) {
    const connection = await this.databaseManagementService.getConnection(data.database);
    await this.userService.setConnection(connection);
    return { message: `Connection updated to database ${data.database}` };
  }

  @MessagePattern({ cmd: 'getPersonalDatabase' })
  async getPersonalDatabase() {
    return this.userService.getPersonalDatabase();
  }

  @MessagePattern({ cmd: 'getBusinessDatabase' })
  async getBusinessDatabase(data: { email: string; domain: string }) {
    return this.userService.getBusinessDatabase(data.email, data.domain);
  }

  @MessagePattern({ cmd: 'setDatabaseConnection' })
  async setDatabaseConnection(data: { database: string }) {
    await this.userService.setDatabaseConnection(data.database);
    return { message: `Database connection set to ${data.database}` };
  }
}