import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6',
    description: 'Role ID to map permissions to',
  })
  @IsNotEmpty()
  @IsUUID()
  role_id: string;

  @ApiProperty({
    example: {
      'a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6': ['read', 'write'],
      'b1c2d3e4-f5g6-h7i8-j9k0-l1m2n3o4p5q6': ['read'],
    },
    description: 'List of menu actions (permissions) to assign',
    type: 'object',
    additionalProperties: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  })
  @IsNotEmpty()
  menu_actions: Record<string, string[]>;
}