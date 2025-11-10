import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessRole } from './entities/business-role.entity';
import { BusinessRoleService } from './business-role.service';
import { BusinessRoleController } from './business-role.controller';
import { DatabaseManager } from 'src/common/database/database.manager';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessRole])],
  providers: [BusinessRoleService,DatabaseManager],
  controllers: [BusinessRoleController],
  exports: [BusinessRoleService],
})
export class BusinessRoleModule {}