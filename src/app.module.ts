import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { RoleModule } from './role/role.module';
import { User } from './user/entities/user.entity';
import { Role } from './role/entities/role.entity';
import { MenuModule } from './menu/menu.module';
import { PermissionModule } from './permission/permission.module';
import { Menu } from './menu/entities/menu.entity';
import { Permission } from './permission/entities/permission.entity';
import { SubscriptionModule } from './subscription/subscription.module';
import { PlanModule } from './plan/plan.module';
import { Subscription } from './subscription/entities/subscription.entity';
import { Plan } from './plan/entities/plan.entity';
import { CronJobsModule } from './cron-jobs/cron-jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      name: 'default',
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'Srikanth@03',
      database: 'lead-crm',
      entities: [
        User,Role, Menu,Permission, Subscription,Plan
      ],
      synchronize: true,
      logging: true,
    }),
    UserModule,
    RoleModule,
    MenuModule,
    PermissionModule,
    SubscriptionModule,
    PlanModule,
    CronJobsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}