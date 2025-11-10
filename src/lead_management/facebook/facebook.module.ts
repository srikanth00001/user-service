import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FacebookController } from './facebook.controller';
import { FacebookService } from './facebook.service';
import { LeadsModule } from '../leads/leads.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { MetaLead } from './entities/facebook.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { DatabaseManager } from 'src/common/database/database.manager';

@Module({
  imports: [HttpModule, LeadsModule, CampaignsModule, TypeOrmModule.forFeature([MetaLead,Campaign])],
  controllers: [FacebookController],
  providers: [FacebookService,DatabaseManager],
})
export class FacebookModule {}