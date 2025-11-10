import { IsString, IsNotEmpty } from 'class-validator';

export class CreateBusinessRoleDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
