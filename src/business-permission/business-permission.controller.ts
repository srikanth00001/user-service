import { Controller, Post, Get, Put, Param, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessPermissionService } from './business-permission.service';
import { CreateBusinessPermissionDto } from './dto/create-business-permission.dto';

@Controller('business-permissions')
@UseGuards(JwtAuthGuard)
export class BusinessPermissionController {
  constructor(private readonly permService: BusinessPermissionService) {}

  @Post()
  async create(@Body() dto: CreateBusinessPermissionDto, @Request() req: any) {
    const tenantKey = req.user.tenantKey;
    return this.permService.create(dto.roleId, dto.permissions, tenantKey);
  }

  @Get()
  async getAll(@Request() req: any) {
    const tenantKey = req.user.tenantKey;
    return this.permService.getAll(tenantKey);
  }

  @Put(':roleId')
  async update(
    @Param('roleId') roleId: string,
    @Body() dto: { permissions: Record<string, string[]> },
    @Request() req: any,
  ) {
    const tenantKey = req.user.tenantKey;
    return this.permService.update(roleId, dto.permissions, tenantKey);
  }
}
