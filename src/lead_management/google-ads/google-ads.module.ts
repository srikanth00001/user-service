import { Module } from '@nestjs/common';
import { GoogleAdsService } from './google-ads.service';
import { GoogleAdsController } from './google-ads.controller';
import { LeadsModule } from '../leads/leads.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleAdsLead } from './entities/google-ad.entity';
import { DatabaseManager } from 'src/common/database/database.manager';

@Module({
  imports: [LeadsModule, TypeOrmModule.forFeature([GoogleAdsLead])],
  controllers: [GoogleAdsController],
  providers: [GoogleAdsService,DatabaseManager],
  exports: [GoogleAdsService],
})
export class GoogleAdsModule {}
