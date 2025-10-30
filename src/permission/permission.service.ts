import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Permission } from './entities/permission.entity';
import { Role } from 'src/role/entities/role.entity';
import { ApiResponseDto } from 'src/common/dto/response.dto';
import { PermissionResponseDto } from './dto/permission_response.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async mapPermission(payload: CreatePermissionDto): Promise<ApiResponseDto> {
    try {
      const role = await this.roleRepository.findOne({
        where: { id: payload.role_id },
      });
      if (!role) {
        this.logger.warn(`Role with ID: ${payload.role_id} not found.`);
        return new ApiResponseDto({
          success: false,
          message: `Role with ID: ${payload.role_id} does not exist.`,
        });
      }

      const existingPermission = await this.permissionRepository.findOne({
        where: { role: { id: role.id } },
      });

      if (existingPermission) {
        // Update existing permission
        const updatedPermission = await this.permissionRepository.save({
          ...existingPermission,
          ...payload,
          role,
        });
        this.logger.log(`Permissions updated for role: ${role.name}.`);
        return new ApiResponseDto({
          success: true,
          message: `Permissions updated successfully for role: ${role.name}.`,
          data: PermissionResponseDto.fromEntity(updatedPermission),
        });
      } else {
        // Create new permission
        const newPermission = this.permissionRepository.create({
          ...payload,
          role,
        });
        const savedPermission = await this.permissionRepository.save(newPermission);
        this.logger.log(`Permissions mapped for role: ${role.name}.`);
        return new ApiResponseDto({
          success: true,
          message: `Permissions mapped successfully for role: ${role.name}.`,
          data: PermissionResponseDto.fromEntity(savedPermission),
        });
      }
    } catch (error) {
      this.logger.error(`mapPermission::Error ${error.message}`, error.stack);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }

  async deletePermission(id: string): Promise<ApiResponseDto> {
    try {
      const permission = await this.permissionRepository.findOne({
        where: { id },
        relations: ['role'],
      });
      if (!permission) {
        this.logger.warn(`Permission with ID: ${id} not found.`);
        return new ApiResponseDto({
          success: false,
          message: `Permission with ID: ${id} does not exist.`,
        });
      }

      await this.permissionRepository.delete(id);
      this.logger.log(`Permissions deleted for role: ${permission.role.name}.`);
      return new ApiResponseDto({
        success: true,
        message: `Permissions deleted successfully for role: ${permission.role.name}.`,
      });
    } catch (error) {
      this.logger.error(`deletePermission::Error ${error.message}`, error.stack);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }

  async getPermission(id: string): Promise<ApiResponseDto> {
    try {
      const permission = await this.permissionRepository.findOne({
        where: { id },
        relations: ['role'],
      });
      if (!permission) {
        this.logger.warn(`Permission with ID: ${id} not found.`);
        return new ApiResponseDto({
          success: false,
          message: `Permission with ID: ${id} does not exist.`,
        });
      }
      this.logger.log(`Permission with ID: ${id} fetched successfully.`);
      return new ApiResponseDto({
        success: true,
        message: 'Permission fetched successfully',
        data: PermissionResponseDto.fromEntity(permission),
      });
    } catch (error) {
      this.logger.error(`getPermission::Error ${error.message}`, error.stack);
      return new ApiResponseDto({
        success: false,
        message: `Error: ${error.message}`,
      });
    }
  }

  async getPermissionList(): Promise<ApiResponseDto> {
  try {
    const permissions = await this.permissionRepository
      .createQueryBuilder('permission')
      .leftJoinAndSelect('permission.role', 'role')
      .orderBy('role.name', 'ASC')
      .addOrderBy('permission.created_at', 'DESC')
      .getMany();

    if (!permissions || permissions.length === 0) {
      this.logger.warn('No permissions found.');
      return new ApiResponseDto({
        success: false,
        message: 'No permissions found.',
      });
    }

    this.logger.log('Permissions fetched successfully.');
    return new ApiResponseDto({
      success: true,
      message: 'Permissions fetched successfully',
      data: PermissionResponseDto.fromEntities(permissions),
    });
  } catch (error) {
    this.logger.error(`getPermissionList::Error ${error.message}`, error.stack);
    return new ApiResponseDto({
      success: false,
      message: `Error: ${error.message}`,
    });
  }
}

}