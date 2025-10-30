import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { PermissionService } from './permission.service';
import { Constants } from 'src/common/constants';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiResponseDto } from 'src/common/dto/response.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreatePermissionDto } from './dto/create-permission.dto';

@ApiTags('Permissions')
@Controller({ path: 'permission', version: Constants.API_VERSION })
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @ApiOperation({ summary: 'Map a permission' })
  @ApiResponse({
    status: 201,
    description: 'Permission has been successfully mapped',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('map')
  mapPermission(@Body() cPermission: CreatePermissionDto) {
    return this.permissionService.mapPermission(cPermission);
  }

  @ApiOperation({ summary: 'Get all permissions' })
  @ApiResponse({
    status: 200,
    description: 'Returns all permissions',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('list')
  async getPermissionList() {
    return await this.permissionService.getPermissionList();
  }

  @ApiOperation({ summary: 'Get a permission by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns the permission information',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('read/:id')
  async getPermission(@Param('id', ParseUUIDPipe) findId: string) {
    return await this.permissionService.getPermission(findId);
  }

  @ApiOperation({ summary: 'Delete a permission' })
  @ApiResponse({
    status: 200,
    description: 'Permission has been successfully deleted',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Delete('delete/:id')
  async deletePermission(@Param('id', ParseUUIDPipe) deleteId: string) {
    return await this.permissionService.deletePermission(deleteId);
  }
}