import { Module } from '@nestjs/common';
import { BusinessUserService } from './business-user.service';
import { BusinessUserController } from './business-user.controller';
import { BusinessRole } from 'src/business-role/entities/business-role.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUser } from './entities/business-user.entity';
import { DatabaseManager } from 'src/common/database/database.manager';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessRole,BusinessUser])],
  controllers: [BusinessUserController],
  providers: [BusinessUserService,DatabaseManager],
   exports: [BusinessUserService],
})
export class BusinessUserModule {}

