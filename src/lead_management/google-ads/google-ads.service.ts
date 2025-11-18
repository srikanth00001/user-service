import { Injectable, Logger } from '@nestjs/common';
import { DatabaseManager } from '../../common/database/database.manager';
import { GoogleAdsLead } from './entities/google-ad.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import * as crypto from 'crypto';

@Injectable()
export class GoogleAdsService {
  private readonly logger = new Logger(GoogleAdsService.name);

  constructor(private readonly dbManager: DatabaseManager) {}

  async handleWebhook(
    payload: any,
    userId: string,
    email: string,
    campaignName?: string,
  ) {
    this.logger.log('--- START handleWebhook ---');
    try {
      if (!payload.gcl_id) {
        this.logger.warn('Missing gcl_id in payload');
        return { status: 'error', message: 'Missing gcl_id' };
      }

      this.logger.log(`Getting tenant connection for userId=${userId}, email=${email}`);
      const { dataSource, tenantKey } = await this.dbManager.getConnectionForUser({ id: userId, email });
      this.logger.log(`Tenant connection established: ${tenantKey}`);

      const leadRepo = dataSource.getRepository(GoogleAdsLead);
      const campaignRepo = dataSource.getRepository(Campaign);

      this.logger.log('Extracting user submitted data from payload...');
      const userData = payload.user_column_data || [];
      const getValue = (key: string) =>
        userData.find(
          (item: any) =>
            item.column_name?.toLowerCase() === key.toLowerCase() ||
            item.column_id?.toLowerCase() === key.toLowerCase(),
        )?.string_value || null;

      const name = getValue('Full Name');
      const emailValue = getValue('User Email') || email;
      const phone = getValue('User Phone');
      const country = getValue('Country');
      const city = getValue('City');
      const region = getValue('Region');
      const postalCode = getValue('Postal Code');

      this.logger.log(`Parsed lead data: name=${name}, email=${emailValue}, phone=${phone}`);

      // STEP 3: Ensure campaign exists
      let campaign: Campaign | null = null;
      if (campaignName) {
        this.logger.log(`Finding campaign: ${campaignName}`);
        campaign = await campaignRepo.findOne({
          where: { name: campaignName, createdBy: userId },
        });

        if (!campaign) {
          this.logger.warn(`Campaign not found, creating new campaign: ${campaignName}`);
          campaign = campaignRepo.create({
            name: campaignName,
            createdBy: userId,
            active: true,
            secretKey: crypto.randomUUID(),
          });

          this.logger.log('Saving new campaign to DB...');
          campaign = await campaignRepo.save(campaign);
          this.logger.log(`Campaign saved with ID: ${campaign.id}`);
        } else {
          this.logger.log(`Campaign found: ID=${campaign.id}`);
        }
      }

      // STEP 4: Create new GoogleAdsLead
      this.logger.log('Creating new GoogleAdsLead entity...');
      const lead = leadRepo.create({
        gclid: payload.gcl_id,
        name,
        email: emailValue,
        phone,
        country,
        city,
        region,
        postalCode,
        rawPayload: payload,
        googleCampaignId: payload.campaign_id || null,
        adGroupId: payload.adgroup_id || null,
        creativeId: payload.creative_id || null,
        createdBy: email,
        campaign,
      });

      this.logger.log('Lead entity created, saving to DB...');
      const saved = await leadRepo.save(lead);

      this.logger.log(`✅ Lead stored successfully → ID: ${saved.id}, gclid: ${saved.gclid}`);
      this.logger.log('--- END handleWebhook ---');

      return {
        status: 'success',
        id: saved.id,
        gclid: saved.gclid,
      };
    } catch (error: any) {
      this.logger.error('❌ Webhook Error:', error);
      return { status: 'error', message: error.message, stack: error.stack };
    }
  }
}
