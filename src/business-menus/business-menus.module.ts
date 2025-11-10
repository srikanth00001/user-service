import { Module } from '@nestjs/common';
import { BusinessMenusService } from './business-menus.service';
import { BusinessMenusController } from './business-menus.controller';

@Module({
  controllers: [BusinessMenusController],
  providers: [BusinessMenusService],
})
export class BusinessMenusModule {}
