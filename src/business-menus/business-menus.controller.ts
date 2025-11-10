import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BusinessMenusService } from './business-menus.service';
import { CreateBusinessMenuDto } from './dto/create-business-menu.dto';
import { UpdateBusinessMenuDto } from './dto/update-business-menu.dto';

@Controller('business-menus')
export class BusinessMenusController {
  constructor(private readonly businessMenusService: BusinessMenusService) {}

  @Post()
  create(@Body() createBusinessMenuDto: CreateBusinessMenuDto) {
    return this.businessMenusService.create(createBusinessMenuDto);
  }

  @Get()
  findAll() {
    return this.businessMenusService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.businessMenusService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBusinessMenuDto: UpdateBusinessMenuDto) {
    return this.businessMenusService.update(+id, updateBusinessMenuDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.businessMenusService.remove(+id);
  }
}
