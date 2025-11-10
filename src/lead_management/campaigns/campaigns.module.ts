import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { DatabaseManager } from 'src/common/database/database.manager';
import { TenantService } from 'src/common/tenant/tenant.service';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign]),
    JwtModule.register({
      secret: 'JWT_SECRET',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    DatabaseManager,
    TenantService,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}
