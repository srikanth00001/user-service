import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateMenuDto {
  @ApiProperty({
    example: 'Dashboard',
    description: 'Menu name',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    example: 1,
    description: 'Display order of the menu item (non-negative integer)',
  })
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  order_by: number;

  @ApiProperty({
    example: 'item',
    description: 'Type of menu (item, dropdown, etc.)',
  })
  @IsNotEmpty()
  @IsString()
  type: string;

  @ApiProperty({
    example: '/dashboard',
    description: 'URL path for the menu item',
  })
  @IsNotEmpty()
  @IsString()
  path: string;

  @ApiProperty({
    example: { id: 1 },
    description: 'Additional parameters for the menu item',
    required: false,
  })
  @IsOptional()
  params?: Record<string, any>;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Parent menu ID for submenu items (UUID)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  parent_id?: string;
}