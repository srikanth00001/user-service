import { Controller, Post, Get, Put, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessRoleService } from './business-role.service';

@Controller('business-roles')
@UseGuards(JwtAuthGuard)
export class BusinessRoleController {
  constructor(private readonly roleService: BusinessRoleService) {}

  @Post()
  async create(@Body() dto: { name: string }, @Request() req: any) {
    const tenantKey = req.user.tenantKey;
    return this.roleService.create(dto.name, tenantKey);
  }

  @Get()
  async getAll(@Request() req: any) {
    const tenantKey = req.user.tenantKey;
    return this.roleService.getAll(tenantKey);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Request() req: any) {
    const tenantKey = req.user.tenantKey;
    return this.roleService.getOne(id, tenantKey);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: { name?: string; active?: boolean },
    @Request() req: any,
  ) {
    const tenantKey = req.user.tenantKey;
    return this.roleService.update(id, dto, tenantKey);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    const tenantKey = req.user.tenantKey;
    return this.roleService.delete(id, tenantKey);
  }
}
