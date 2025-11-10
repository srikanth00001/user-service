// src/lead_management/facebook/facebook.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DatabaseManager } from '../../common/database/database.manager';
import { CampaignsService } from '../campaigns/campaigns.service';
import { MetaLead } from './entities/facebook.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';

@Injectable()
export class FacebookService {
  private readonly accessToken = 'EAAYxnsRjJBkBPbRww6kHqRzOSaJ0FhUpmO1Y6lN9BW34sPCHyMq6W2nvitZBdtZAlU1ah1QEgIDQUemGiOSCElwvZAYBoEDurWr5IZCPupmrxv3vUkajwOqeNYvTiKlih6VyrFD4eaCSZCrZCSJgdu1XZAgCiu1q4utxSnhNkrgN3bhNcBOZAquAOeCi69bWkfYQhnKfqynlhwZAZAQy7n4xmbfPQEcB8BntmFPnp3qRwZC0JawUgZDZD';

  constructor(
    private readonly httpService: HttpService,
    private readonly dbManager: DatabaseManager,
    private readonly campaignsService: CampaignsService,
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

      const { data: leadData } = await firstValueFrom(
        this.httpService.get(`https://graph.facebook.com/v23.0/${leadgenId}?access_token=${this.accessToken}`)
      );

      const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
      const repo = dataSource.getRepository(MetaLead);

      if (await repo.findOne({ where: { leadgenId } })) {
        return { status: 'success', message: 'already_exists' };
      }

      const fieldData = (leadData.field_data || []).reduce((acc: any, f: any) => {
        acc[f.name] = f.values?.[0] || null;
        return acc;
      }, {});

      let campaign: Campaign | null = null;
      if (facebookCampaignId && pageId) {
        campaign = await this.campaignsService.findByFacebookId(pageId, facebookCampaignId, { id: userId, email });
        if (!campaign) {
          const { data } = await firstValueFrom(
            this.httpService.get(`https://graph.facebook.com/v23.0/${facebookCampaignId}?fields=name&access_token=${this.accessToken}`)
          );
          campaign = await this.campaignsService.create({
            facebookCampaignId,
            name: data.name || 'Unknown Campaign',
            pageId,
          }, { id: userId, email });
        }
      }

      const metaLead = repo.create({
        leadgenId,
        pageId,
        name: fieldData.full_name ?? null,
        email: fieldData.email ?? null,
        phone: fieldData.phone_number ?? null,
        fieldData,
        formId: leadData.form_id,
        adId: leadEntry.ad_id,
        adsetId: leadEntry.adset_id,
        facebookCampaignId,
        campaign, // Pass full entity or null
        createdBy: userId,
      });

      const saved = await repo.save(metaLead);
      return { status: 'success', leadgenId, id: saved.id };
    } catch (error: any) {
      console.error('Facebook webhook error:', error);
      throw new HttpException(error.message || 'Internal error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}