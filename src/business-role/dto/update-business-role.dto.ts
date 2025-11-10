import { PartialType } from '@nestjs/swagger';
import { CreateBusinessRoleDto } from './create-business-role.dto';

export class UpdateBusinessRoleDto extends PartialType(CreateBusinessRoleDto) {}
