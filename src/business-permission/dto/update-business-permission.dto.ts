import { PartialType } from '@nestjs/swagger';
import { CreateBusinessPermissionDto } from './create-business-permission.dto';

export class UpdateBusinessPermissionDto extends PartialType(CreateBusinessPermissionDto) {}
