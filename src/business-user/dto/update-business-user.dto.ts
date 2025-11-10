import { PartialType } from '@nestjs/swagger';
import { CreateBusinessUserDto } from './create-business-user.dto';

export class UpdateBusinessUserDto extends PartialType(CreateBusinessUserDto) {}
