import { Controller, Post, Body, Get, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { RoleService } from './role.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createRole(@Body() roleData: { name: string }) {
    return this.roleService.createRole(roleData);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getRoles() {
    return this.roleService.getRoles();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getRole(@Param('id') id: string) {
    return this.roleService.getRole(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateRole(@Param('id') id: string, @Body() roleData: { name: string }) {
    return this.roleService.updateRole(id, roleData);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteRole(@Param('id') id: string) {
    return this.roleService.deleteRole(id);
  }
}