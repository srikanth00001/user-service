import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { Constants } from 'src/common/constants';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiResponseDto } from 'src/common/dto/response.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('Roles')
@Controller({ path: 'role', version: Constants.API_VERSION })
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({
    status: 201,
    description: 'Role has been successfully created',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('create')
  async createRole(@Body() rolePayload: CreateRoleDto) {
    return await this.roleService.createRole(rolePayload);
  }

  @ApiOperation({ summary: 'Update a role' })
  @ApiResponse({
    status: 200,
    description: 'Role has been successfully updated',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Put('update/:id')
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePayload: UpdateRoleDto,
  ) {
    return await this.roleService.updateRole(id, updatePayload);
  }

  @ApiOperation({ summary: 'Get a role by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns the role information',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('read/:id')
  async getRole(@Param('id', ParseUUIDPipe) findId: string) {
    return await this.roleService.getRole(findId);
  }

  @ApiOperation({ summary: 'Get all roles' })
  @ApiResponse({
    status: 200,
    description: 'Returns all roles',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @Get('list')
  async getRoleList() {
    return await this.roleService.getRoleList();
  }

  @ApiOperation({ summary: 'Delete a role' })
  @ApiResponse({
    status: 200,
    description: 'Role has been successfully deleted',
    type: ApiResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Delete('delete/:id')
  async deleteRole(@Param('id', ParseUUIDPipe) id: string) {
    return await this.roleService.deleteRole(id);
  }
}