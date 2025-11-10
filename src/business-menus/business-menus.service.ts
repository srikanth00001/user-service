import { Injectable } from '@nestjs/common';
import { CreateBusinessMenuDto } from './dto/create-business-menu.dto';
import { UpdateBusinessMenuDto } from './dto/update-business-menu.dto';

@Injectable()
export class BusinessMenusService {
  create(createBusinessMenuDto: CreateBusinessMenuDto) {
    return 'This action adds a new businessMenu';
  }

  findAll() {
    return `This action returns all businessMenus`;
  }

  findOne(id: number) {
    return `This action returns a #${id} businessMenu`;
  }

  update(id: number, updateBusinessMenuDto: UpdateBusinessMenuDto) {
    return `This action updates a #${id} businessMenu`;
  }

  remove(id: number) {
    return `This action removes a #${id} businessMenu`;
  }
}
