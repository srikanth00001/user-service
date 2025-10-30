import { Role } from 'src/role/entities/role.entity';

export class RoleMinDto {
  id: string;
  name: string;
  active: boolean;

  constructor(role: Role) {
    this.id = role.id;
    this.name = role.name;
    this.active = role.active;
  }

  static fromEntity(role: Role): RoleMinDto {
    return new RoleMinDto(role);
  }

  static fromEntities(roles: Role[]): RoleMinDto[] {
    return roles.map((role) => new RoleMinDto(role));
  }
}
