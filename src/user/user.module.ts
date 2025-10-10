import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { User } from './entities/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../auth/jwt.strategy';
import { Role } from '../role/entities/role.entity';
import { DatabaseManagementService } from './database-management.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role]),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: 'JWT_SECRET',
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [UserController],
  providers: [UserService, JwtStrategy, DatabaseManagementService],
  exports: [UserService, DatabaseManagementService],
})
export class UserModule {}