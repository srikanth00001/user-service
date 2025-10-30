import { IsOptional, IsString, IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateMenuDto {
    @ApiProperty({
        example: 'Dashboard',
        description: 'Menu name',
        required: false,
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({
        example: 1,
        description: 'Display order of the menu item (non-negative integer)',
        required: false,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Type(() => Number)
    order_by?: number;

    @ApiProperty({
        example: 'item',
        description: 'Type of menu (item, dropdown, etc.)',
        required: false,
    })
    @IsOptional()
    @IsString()
    type?: string;

    @ApiProperty({
        example: '/dashboard',
        description: 'URL path for the menu item',
        required: false,
    })
    @IsOptional()
    @IsString()
    path?: string;

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

    @ApiProperty({
        example: true,
        description: 'Whether the menu is active',
        required: false,
    })
    @IsOptional()
    active?: boolean;

    @ApiProperty({
        example: 'icon.png',
        description: 'Icon file path for the menu item',
        required: false,
    })
    @IsOptional()
    @IsString()
    icon?: string;
}