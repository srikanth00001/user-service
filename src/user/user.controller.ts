import { Controller, Post, Body, Get, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Constants } from 'src/common/constants';

@Controller({ path: 'user', version: Constants.API_VERSION })
export class UserController {
  constructor(private readonly userService: UserService) {}

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
  async updateUserByMicroservice(data: { id: string; passwordAlreadyHashed?: boolean; [key: string]: any }) {
    return this.userService.updateUser(data.id, data, data.passwordAlreadyHashed);
  }

  @MessagePattern({ cmd: 'findRoleByName' })
  async findRoleByName(name: string) {
    return this.userService.findRoleByName(name);
  }

  @MessagePattern({ cmd: 'findBusinessUserByEmail' })
async findBusinessUserByEmail(email: string) {
  return this.userService.findBusinessUserByEmail(email);
}

@MessagePattern({ cmd: 'seedBusinessTenant' })
async seedBusinessTenant(data: any) {
  return this.userService.seedBusinessTenant(data);
}



}