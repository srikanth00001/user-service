import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseManager } from '../../common/database/database.manager';
import { GoogleAdsLead } from './entities/google-ad.entity';

@Injectable()
export class GoogleAdsService {
  constructor(private readonly dbManager: DatabaseManager) {}

  async handleWebhook(payload: any, userId: string, email: string) {
    if (!payload.gcl_id) {
      throw new HttpException('Missing gcl_id', HttpStatus.BAD_REQUEST);
    }

    // ✅ Extract user column data
    const userData = payload.user_column_data || [];
    const getValue = (key: string) =>
      userData.find(
        (item: any) =>
          item.column_name?.toLowerCase() === key.toLowerCase() ||
          item.column_id?.toLowerCase() === key.toLowerCase(),
      )?.string_value || null;

    const name = getValue('Full Name');
    const emailValue = getValue('User Email');
    const phone = getValue('User Phone');
    const country = getValue('Country');
    const city = getValue('City');
    const region = getValue('Region');
    const postalCode = getValue('Postal Code');

    // ✅ Connect to correct company DB
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const repo = dataSource.getRepository(GoogleAdsLead);

    // ✅ Create lead entry
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
      googleCampaignId: payload.campaign_id,
      adGroupId: payload.adgroup_id,
      creativeId: payload.creative_id,
      createdBy: email,
    });

    const saved = await repo.save(lead);
    return { id: saved.id, gclid: saved.gclid };
  }
}
