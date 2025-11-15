import { Injectable } from '@nestjs/common';
import { DatabaseManager } from '../../common/database/database.manager';
import { GoogleAdsLead } from './entities/google-ad.entity';

@Injectable()
export class GoogleAdsService {
  constructor(private readonly dbManager: DatabaseManager) {}

  async handleWebhook(payload: any, userId: string, email: string) {
    try {
      if (!payload.gcl_id) {
        console.warn('Missing gcl_id in payload', payload);
        return { status: 'error', message: 'Missing gcl_id' };
      }

      // Extract user column data safely
      const userData = payload.user_column_data || [];
      const getValue = (key: string) =>
        userData.find(
          (item: any) =>
            item.column_name?.toLowerCase() === key.toLowerCase() ||
            item.column_id?.toLowerCase() === key.toLowerCase()
        )?.string_value || null;

      const name = getValue('Full Name');
      const emailValue = getValue('User Email') || email; // fallback
      const phone = getValue('User Phone');
      const country = getValue('Country');
      const city = getValue('City');
      const region = getValue('Region');
      const postalCode = getValue('Postal Code');

      // Connect to correct company DB
      const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
      if (!dataSource) {
        console.error('No data source found for user:', userId, email);
        return { status: 'error', message: 'No DB connection' };
      }

      const repo = dataSource.getRepository(GoogleAdsLead);

      // Create lead entry
      const lead = repo.create({
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
      });

      const saved = await repo.save(lead);

      return {
        status: 'success',
        id: saved.id,
        gclid: saved.gclid,
      };
    } catch (error: any) {
      // Always return 200 OK to Google Ads
      console.error('Error handling Google Ads webhook:', error.message, error.stack);
      return {
        status: 'error',
        message: error.message || 'Internal server error',
      };
    }
  }
}
