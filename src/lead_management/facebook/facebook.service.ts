// src/lead_management/facebook/facebook.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DatabaseManager } from '../../common/database/database.manager';
import { MetaLead } from './entities/facebook.entity';

@Injectable()
export class FacebookService {
  private readonly accessToken =
    'EAAYxnsRjJBkBPbRww6kHqRzOSaJ0FhUpmO1Y6lN9BW34sPCHyMq6W2nvitZBdtZAlU1ah1QEgIDQUemGiOSCElwvZAYBoEDurWr5IZCPupmrxv3vUkajwOqeNYvTiKlih6VyrFD4eaCSZCrZCSJgdu1XZAgCiu1q4utxSnhNkrgN3bhNcBOZAquAOeCi69bWkfYQhnKfqynlhwZAZAQy7n4xmbfPQEcB8BntmFPnp3qRwZC0JawUgZDZD';

  constructor(
    private readonly httpService: HttpService,
    private readonly dbManager: DatabaseManager,
  ) {}

  async handleWebhook(payload: any, userId: string, email: string) {
    try {
      const leadEntry = payload.entry?.[0]?.changes?.[0]?.value;

      if (!leadEntry?.leadgen_id) {
        throw new HttpException('Missing leadgen_id', HttpStatus.BAD_REQUEST);
      }

      const leadgenId = leadEntry.leadgen_id;
      const pageId = leadEntry.page_id;
      const facebookCampaignId = leadEntry.campaign_id || leadEntry.adgroup_id;

      // Fetch lead details from Facebook Graph API
      const { data: leadData } = await firstValueFrom(
        this.httpService.get(
          `https://graph.facebook.com/v23.0/${leadgenId}?access_token=${this.accessToken}`,
        ),
      );

      const { dataSource } = await this.dbManager.getConnectionForUser({
        id: userId,
        email,
      });

      const repo = dataSource.getRepository(MetaLead);

      // Avoid duplicate leads
      if (await repo.findOne({ where: { leadgenId } })) {
        return { status: 'success', message: 'already_exists' };
      }

      // Format field data
      const fieldData = (leadData.field_data || []).reduce(
        (acc: any, f: any) => {
          acc[f.name] = f.values?.[0] || null;
          return acc;
        },
        {},
      );

      // Create & save Meta Lead
      const metaLead = repo.create({
        leadgenId,
        pageId,
        facebookCampaignId,
        name: fieldData.full_name ?? null,
        email: fieldData.email ?? null,
        phone: fieldData.phone_number ?? null,
        fieldData,
        formId: leadData.form_id,
        adId: leadEntry.ad_id,
        adsetId: leadEntry.adset_id,
        createdBy: userId,
      });

      const saved = await repo.save(metaLead);

      return { status: 'success', leadgenId, id: saved.id };
    } catch (error: any) {
      console.error('Facebook webhook error:', error);
      throw new HttpException(
        error.message || 'Internal error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
