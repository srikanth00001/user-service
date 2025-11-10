import { PartialType } from '@nestjs/swagger';
import { CreateBusinessMenuDto } from './create-business-menu.dto';

export class UpdateBusinessMenuDto extends PartialType(CreateBusinessMenuDto) {}
