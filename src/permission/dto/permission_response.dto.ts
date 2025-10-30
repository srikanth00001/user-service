import moment from 'moment-timezone';
import { Role } from 'src/role/entities/role.entity';
import { Permission } from '../entities/permission.entity';


export class PermissionResponseDto {
  id: string;
  role: Role;
  menu_actions: Record<string, string[]>;
  created_at: string;
  updated_at: string;
  active: boolean;

  constructor(permission: Permission) {
    this.id = permission.id;
    this.role = permission.role;
    this.menu_actions = permission.menu_actions;
    this.active = permission.active;
    this.created_at = moment(permission.created_at).tz('Asia/Kolkata').format();
    this.updated_at = permission.updated_at
      ? moment(permission.updated_at).tz('Asia/Kolkata').format()
      : '';
  }

  static fromEntity(permission: Permission): PermissionResponseDto {
    return new PermissionResponseDto(permission);
  }

  static fromEntities(permissions: Permission[]): PermissionResponseDto[] {
    return permissions.map((permission) => new PermissionResponseDto(permission));
  }
}