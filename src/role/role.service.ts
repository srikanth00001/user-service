import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { ApiResponseDto } from 'src/common/dto/response.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleMinDto } from './dto/role_response.dto';
@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async createRole(payload: CreateRoleDto): Promise<ApiResponseDto> {
    try {
      const isNameExists = await this.roleRepository.findOne({
        where: { name: payload.name },
      });
      if (isNameExists) {
        this.logger.warn(`Role: ${payload.name} already exists.`);
        return new ApiResponseDto({
          success: false,
          message: `Role: ${payload.name} already exists.`,
        });
      }
      const newRole = this.roleRepository.create(payload);
      await this.roleRepository.save(newRole);
      this.logger.log(`Role: ${payload.name} created successfully.`);
      return new ApiResponseDto({
        success: true,
        message: `Role: ${payload.name} added successfully.`,
        data: RoleMinDto.fromEntity(newRole),
      });
    } catch (error) {
      this.logger.error(`createRole::Error ${error.message}`, error.stack);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }

  async updateRole(id: string, updatePayload: UpdateRoleDto): Promise<ApiResponseDto> {
  try {
    const role = await this.roleRepository.findOneBy({ id });
    if (!role) {
      this.logger.warn(`Role with ID: ${id} not found.`);
      return new ApiResponseDto({
        success: false,
        message: `Role with ID: ${id} not found.`,
      });
    }

    // Update name and active fields if provided
    await this.roleRepository.update(id, {
      name: updatePayload.name,
      ...(updatePayload.active !== undefined && { active: updatePayload.active }),
    });
    const updatedRole = await this.roleRepository.findOneBy({ id });

    if (!updatedRole) {
      this.logger.error(`Role with ID: ${id} not found after update.`);
      return new ApiResponseDto({
        success: false,
        message: 'Role not exists or failed to update',
      });
    }

    this.logger.log(`Role with ID: ${id} updated successfully.`);
    return new ApiResponseDto({
      success: true,
      message: 'Role updated successfully',
      data: RoleMinDto.fromEntity(updatedRole),
    });
  } catch (error) {
    this.logger.error(`updateRole::Error ${error.message}`, error.stack);
    return new ApiResponseDto({
      success: false,
      message: `Error: ${error.message}`,
    });
  }
}

  async getRole(id: string): Promise<ApiResponseDto> {
    try {
      const response = await this.roleRepository.findOneBy({ id });
      if (!response) {
        this.logger.warn(`Role with ID: ${id} not found.`);
        return new ApiResponseDto({
          success: false,
          message: "Role doesn't exist",
        });
      }
      this.logger.log(`Role with ID: ${id} fetched successfully.`);
      return new ApiResponseDto({
        success: true,
        message: 'Role exists',
        data: RoleMinDto.fromEntity(response),
      });
    } catch (error) {
      this.logger.error(`getRole::Error ${error.message}`, error.stack);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }

  async getRoleList(): Promise<ApiResponseDto> {
    try {
      const roles = await this.roleRepository.find({
        order: { name: 'ASC' },
      });

      if (!roles || roles.length === 0) {
        this.logger.warn('No roles found.');
        return new ApiResponseDto({
          success: false,
          message: 'No roles found.',
        });
      }

      this.logger.log('Roles fetched successfully.');
      return new ApiResponseDto({
        success: true,
        message: 'Roles fetched successfully',
        data: RoleMinDto.fromEntities(roles),
      });
    } catch (error) {
      this.logger.error(`getRoleList::Error ${error.message}`, error.stack);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }

  async deleteRole(id: string): Promise<ApiResponseDto> {
    try {
      const role = await this.roleRepository.findOneBy({ id });
      if (!role) {
        this.logger.warn(`Role with ID: ${id} not found.`);
        return new ApiResponseDto({
          success: false,
          message: `Role with ID: ${id} not found.`,
        });
      }

      await this.roleRepository.delete(id);
      this.logger.log(`Role with ID: ${id} deleted successfully.`);
      return new ApiResponseDto({
        success: true,
        message: 'Role deleted successfully',
      });
    } catch (error) {
      this.logger.error(`deleteRole::Error ${error.message}`, error.stack);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }
}