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
import { FacebookPage } from './entities/facebook-page.entity';
import { FacebookPageService } from './facebook-page.service';
import { MetaApp } from './entities/meta-app.entity';
import { MetaConnection } from './entities/meta-connection.entity';

@Module({
  imports: [HttpModule, LeadsModule, CampaignsModule, TypeOrmModule.forFeature([MetaLead,Campaign,FacebookPage,MetaApp,MetaConnection])],
  controllers: [FacebookController],
  providers: [FacebookService,DatabaseManager,FacebookPageService],
})
export class FacebookModule {}