import moment from 'moment-timezone';
import { Menu } from '../entities/menu.entity';

export class MenuResponseDto {
  id: string;
  name: string;
  order_by: number;
  type: string;
  icon: string;
  path: string;
  params: Record<string, any>;
  parent_id: string;
  created_at: string;
  updated_at: string;
  active: boolean;

  constructor(menu: Menu) {
    this.id = menu.id;
    this.name = menu.name;
    this.order_by = menu.order_by;
    this.type = menu.type;
    this.icon = menu.icon;
    this.path = menu.path;
    this.params = menu.params;
    this.parent_id = menu.parent_id;
    this.created_at = moment(menu.created_at).tz('Asia/Kolkata').format();
    this.updated_at = menu.updated_at
      ? moment(menu.updated_at).tz('Asia/Kolkata').format()
      : '';
    this.active = menu.active;
  }

  static fromEntity(menu: Menu): MenuResponseDto {
    return new MenuResponseDto(menu);
  }

  static fromEntities(menus: Menu[]): MenuResponseDto[] {
    return menus.map((menu) => new MenuResponseDto(menu));
  }
}