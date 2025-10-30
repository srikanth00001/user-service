import { IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRoleDto {
  @ApiProperty({
    example: 'user',
    description: 'Role name',
  })
  @IsOptional()
  @IsString()
  name: string;

  @ApiProperty({
    example: true,
    description: 'Role active status',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}