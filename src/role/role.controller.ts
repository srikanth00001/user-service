import { Controller, Post, Body, Get, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { RoleService } from './role.service';

@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  async createRole(@Body() roleData: { name: string }) {
    return this.roleService.createRole(roleData);
  }

  @Get()
  async getRoles() {
    return this.roleService.getRoles();
  }

  @Get(':id')
  async getRole(@Param('id') id: string) {
    return this.roleService.getRole(id);
  }

  @Put(':id')
  async updateRole(@Param('id') id: string, @Body() roleData: { name: string }) {
    return this.roleService.updateRole(id, roleData);
  }

  @Delete(':id')
  async deleteRole(@Param('id') id: string) {
    return this.roleService.deleteRole(id);
  }
}