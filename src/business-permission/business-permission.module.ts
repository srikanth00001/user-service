import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessPermission } from './entities/business-permission.entity';
import { BusinessRole } from '../business-role/entities/business-role.entity';
import { BusinessPermissionService } from './business-permission.service';
import { BusinessPermissionController } from './business-permission.controller';
import { DatabaseManager } from 'src/common/database/database.manager';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessPermission, BusinessRole])],
  providers: [BusinessPermissionService,DatabaseManager],
  controllers: [BusinessPermissionController],
  exports: [BusinessPermissionService],
})
export class BusinessPermissionModule {}