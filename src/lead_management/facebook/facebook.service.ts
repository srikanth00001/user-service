import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DatabaseManager } from '../../common/database/database.manager';
import { MetaLead } from './entities/facebook.entity';
import { FacebookPage } from './entities/facebook-page.entity';
import { FacebookPageService } from './facebook-page.service';
import { MetaApp } from './entities/meta-app.entity';
import { Repository } from 'typeorm';
import { MetaConnection } from './entities/meta-connection.entity';

@Injectable()
export class FacebookService {

  constructor(
    private readonly httpService: HttpService,
    private readonly dbManager: DatabaseManager,
    private readonly facebookPageService: FacebookPageService,
  ) {}

  async getMetaApp(tenantKey: string): Promise<MetaApp> {
  const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
  const repo = dataSource.getRepository(MetaApp);
  const config = await repo.findOne({ where: { tenantKey, active: true } });
  if (!config) throw new Error('Meta App not configured for this tenant');
  return config;
}

async generateSystemUserToken(appId: string, appSecret: string): Promise<string> {
    const res = await firstValueFrom(
      this.httpService.post(`https://graph.facebook.com/v20.0/${appId}/access_tokens`, null, {
        params: {
          grant_type: 'client_credentials',
          client_id: appId,
          client_secret: appSecret,
        },
      }),
    );
    return res.data.access_token;
  }


  async saveWhatsAppConnection(
    tenantKey: string,
    userId: string,
    data: {
      phoneNumberId: string;
      displayPhoneNumber: string;
      wabaId: string;
      pageId: string;
      pageName: string;
      longLivedToken: string; // REQUIRED IN DEV MODE
    },
  ) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(MetaConnection);

    let connection = await repo.findOne({ where: { phoneNumberId: data.phoneNumberId } });

    if (!connection) {
      connection = repo.create({
        tenantKey,
        connectedByUserId: userId,
        businessManagerId: '',
        wabaId: data.wabaId,
        phoneNumberId: data.phoneNumberId,
        phoneNumber: data.displayPhoneNumber.replace(/[^0-9]/g, ''),
        displayPhoneNumber: data.displayPhoneNumber,
        accessToken: data.longLivedToken, // Use long-lived user token
        verified: true,
        active: true,
        connectedAt: new Date(),
      });
    } else {
      connection.active = true;
      connection.accessToken = data.longLivedToken;
    }

    await repo.save(connection);
    return connection;
  }

  async handleOAuthCallback(code: string, userId: string, tenantKey: string) {
    try {
      console.log('📌 OAuth Callback started for user:', userId);
      const metaApp = await this.getMetaApp(tenantKey);

      // 1️⃣ Short-lived token
      const tokenRes = await firstValueFrom(
    this.httpService.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        client_id: metaApp.appId,
        client_secret: metaApp.appSecret,
        redirect_uri: metaApp.redirectUri,
        code,
      },
    }),
      );
      const userAccessToken = tokenRes.data.access_token;
      if (!userAccessToken) throw new Error('Facebook did not return an access token');

      const longLivedRes = await firstValueFrom(
  this.httpService.get('https://graph.facebook.com/v19.0/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: metaApp.appId,
      client_secret: metaApp.appSecret,
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


 async handleWhatsAppOAuthCallback(code: string, userId: string, tenantKey: string) {
    const metaApp = await this.getMetaApp(tenantKey);

    // Step 1: Short-lived token
    const tokenRes = await firstValueFrom(
      this.httpService.get('https://graph.facebook.com/v20.0/oauth/access_token', {
        params: {
          client_id: metaApp.appId,
          client_secret: metaApp.appSecret,
          redirect_uri: metaApp.redirectUri,
          code,
        },
      }),
    );

    const userToken = tokenRes.data.access_token;

    // Step 2: Long-lived token (60 days)
    const longLived = await firstValueFrom(
      this.httpService.get('https://graph.facebook.com/v20.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: metaApp.appId,
          client_secret: metaApp.appSecret,
          fb_exchange_token: userToken,
        },
      }),
    );

    const longLivedToken = longLived.data.access_token;

    // Step 3: Get WhatsApp numbers via /me/businesses (2025 working endpoint)
    const businessRes = await firstValueFrom(
      this.httpService.get('https://graph.facebook.com/v20.0/me/businesses', {
        params: {
          fields: 'id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}',
          access_token: longLivedToken,
        },
      }),
    );

    const businesses = businessRes.data.data || [];
    const availableNumbers: any[] = [];

    for (const business of businesses) {
      const wabas = business.owned_whatsapp_business_accounts?.data || [];
      for (const waba of wabas) {
        const phones = waba.phone_numbers?.data || [];
        for (const phone of phones) {
          availableNumbers.push({
            id: phone.id,
            phoneNumberId: phone.id,
            displayPhoneNumber: phone.display_phone_number,
            verifiedName: phone.verified_name || phone.display_phone_number,
            wabaId: waba.id,
            wabaName: waba.name,
            businessId: business.id,
            businessName: business.name,
            pageId: '',
            pageName: business.name,
          });
        }
      }
    }

    return {
      success: true,
      availableNumbers,
      longLivedToken, // SEND THIS TO FRONTEND
    };
  }

  // src/lead_management/facebook/facebook.service.ts

async saveMetaAppConfig(tenantKey: string, data: { appId: string; appSecret: string; redirectUri: string }) {
  const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
  const repo = ds.getRepository(MetaApp);

  let config = await repo.findOne({ where: { tenantKey } });

  if (config) {
    config.appId = data.appId.trim();
    config.appSecret = data.appSecret.trim();
    config.redirectUri = data.redirectUri.trim();
    config.active = true;
  } else {
    config = repo.create({
      tenantKey,
      appId: data.appId.trim(),
      appSecret: data.appSecret.trim(),
      redirectUri: data.redirectUri.trim(),
      active: true,
    });
  }

  await repo.save(config);

  return {
    success: true,
    data: {
      appId: config.appId,
      redirectUri: config.redirectUri,
    },
  };
}

async getMetaAppConfig(tenantKey: string) {
  const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
  const config = await ds.getRepository(MetaApp).findOne({
    where: { tenantKey, active: true },
  });

  if (!config) {
    return { success: true, data: null };
  }

  return {
    success: true,
    data: {
      appId: config.appId,
      redirectUri: config.redirectUri,
    },
  };
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
