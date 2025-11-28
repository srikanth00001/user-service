import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DatabaseManager } from '../../common/database/database.manager';
import { MetaLead } from './entities/facebook.entity';
import { FacebookPage } from './entities/facebook-page.entity';
import { FacebookPageService } from './facebook-page.service';

@Injectable()
export class FacebookService {
  private readonly appId = '1154166966587208';
  private readonly appSecret = '28f1aca5d36e80e64d840f0339f9eb68';
  private readonly redirectUri =
    'https://ce27754e75a9.ngrok-free.app/v1/facebook/oauth-callback';

  constructor(
    private readonly httpService: HttpService,
    private readonly dbManager: DatabaseManager,
    private readonly facebookPageService: FacebookPageService,
  ) {}

  async handleOAuthCallback(code: string, userId: string, tenantKey: string) {
    try {
      console.log('📌 OAuth Callback started for user:', userId);

      // 1️⃣ Short-lived token
      const tokenRes = await firstValueFrom(
        this.httpService.get('https://graph.facebook.com/v19.0/oauth/access_token', {
          params: {
            client_id: this.appId,
            client_secret: this.appSecret,
            redirect_uri: this.redirectUri,
            code,
          },
        }),
      );
      const userAccessToken = tokenRes.data.access_token;
      if (!userAccessToken) throw new Error('Facebook did not return an access token');

      // 2️⃣ Long-lived token
      const longLivedRes = await firstValueFrom(
        this.httpService.get('https://graph.facebook.com/v19.0/oauth/access_token', {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: this.appId,
            client_secret: this.appSecret,
            fb_exchange_token: userAccessToken,
          },
        }),
      );
      const longLivedToken = longLivedRes.data.access_token;
      if (!longLivedToken) throw new Error('Facebook did not return a long-lived access token');

      // 3️⃣ Fetch pages
      const pagesRes = await firstValueFrom(
        this.httpService.get('https://graph.facebook.com/v19.0/me/accounts', {
          params: { access_token: longLivedToken },
        }),
      );
      const pages = pagesRes.data.data;

      // 4️⃣ Save pages
      const savedPages: FacebookPage[] = [];
      for (const page of pages) {
        const saved = await this.facebookPageService.saveConnectedPage({
          tenantKey,
          userId,
          pageId: page.id,
          pageName: page.name,
          accessToken: page.access_token,
        });
        savedPages.push(saved);
      }

      // 5️⃣ Return saved pages
      return {
        success: true,
        pages: savedPages.map((p: FacebookPage) => ({
          id: p.pageId,
          name: p.pageName,
          access_token: p.accessToken,
        })),
      };
    } catch (err: any) {
      console.error('❌ Full Facebook OAuth error:', err.response?.data || err.message || err);
      throw new Error(`Facebook OAuth failed: ${JSON.stringify(err.response?.data || err.message)}`);
    }
  }

  async handleWebhook(payload: any) {
    try {
      const entry = payload.entry?.[0]?.changes?.[0]?.value;
      if (!entry?.leadgen_id || !entry.page_id) return { status: 'ignored' };

      const pageId = entry.page_id;
      const leadgenId = entry.leadgen_id;

      const tenantKey = await this.facebookPageService.findTenantByPageId(pageId);
      if (!tenantKey) return { status: 'tenant_not_found' };

      const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
      const leadRepo = dataSource.getRepository(MetaLead);
      const pageRepo = dataSource.getRepository(FacebookPage);

      if (await leadRepo.findOne({ where: { leadgenId } })) return { status: 'duplicate' };

      const page = await pageRepo.findOne({ where: { pageId, active: true } });
      if (!page) throw new Error('Page record not found');

      const { data: leadData } = await firstValueFrom(
        this.httpService.get(`https://graph.facebook.com/v23.0/${leadgenId}?access_token=${page.accessToken}`),
      );

      const fieldData = (leadData.field_data || []).reduce((acc: any, f: any) => {
        acc[f.name] = f.values?.[0] || null;
        return acc;
      }, {});

      const metaLead = leadRepo.create({
        leadgenId,
        pageId,
        name: fieldData.full_name,
        email: fieldData.email,
        phone: fieldData.phone_number,
        fieldData,
        formId: leadData.form_id,
        adId: entry.ad_id,
        createdBy: page.connectedByUserId,
      });

      await leadRepo.save(metaLead);

      return { status: 'success', tenantKey };
    } catch (err) {
      console.error('Webhook error:', err);
      return { status: 'error' };
    }
  }

  async sendTestLead(pageId: string, formId: string) {
  const page = await this.facebookPageService.getPageById(pageId);
  if (!page) throw new Error('Page not found');

  return firstValueFrom(
    this.httpService.post(
      `https://graph.facebook.com/v24.0/${formId}/leads`,
      {},
      { headers: { Authorization: `Bearer ${page.accessToken}` } },
    ),
  );
}


}
