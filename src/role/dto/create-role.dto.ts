import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({
    example: 'user',
    description: 'Role name',
  })
  @IsNotEmpty()
  @IsString()
  name: string;
}
