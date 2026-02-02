import { Injectable } from '@nestjs/common';
import FormData = require('form-data');
import * as crypto from 'crypto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DatabaseManager } from '../../common/database/database.manager';
import { MetaLead } from './entities/facebook.entity';
import { FacebookPage } from './entities/facebook-page.entity';
import { FacebookPageService } from './facebook-page.service';
import { MetaApp } from './entities/meta-app.entity';
import { Repository } from 'typeorm';
import { MetaConnection } from './entities/meta-connection.entity';
import { TeamInboxService } from 'src/team-inbox/team-inbox.service';
import { PhoneTenantMap } from '../leads/entities/phone-tenant-map.entity';
import { Message } from 'src/message/entities/message.entity';

@Injectable()
export class FacebookService {

  constructor(
    private readonly httpService: HttpService,
    private readonly dbManager: DatabaseManager,
    private readonly facebookPageService: FacebookPageService,
    private readonly teamInboxService: TeamInboxService,
  ) { }

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
      // Generate unique webhook token for new connections
      const crypto = require('crypto');
      const webhookToken = crypto.randomBytes(32).toString('hex');

      connection = repo.create({
        tenantKey,
        connectedByUserId: userId,
        createdBy: userId,
        businessManagerId: '',
        wabaId: data.wabaId,
        phoneNumberId: data.phoneNumberId,
        phoneNumber: data.displayPhoneNumber.replace(/[^0-9]/g, ''),
        displayPhoneNumber: data.displayPhoneNumber,
        accessToken: data.longLivedToken, // Use long-lived user token
        verified: true,
        active: true,
        connectedAt: new Date(),
        webhookToken, // Set generated token
        webhookVerified: false,
      });
    } else {
      connection.active = true;
      connection.accessToken = data.longLivedToken;
      // Set createdBy if not already set
      if (!connection.createdBy) {
        connection.createdBy = userId;
      }
      // Generate token if not exists
      if (!connection.webhookToken) {
        const crypto = require('crypto');
        connection.webhookToken = crypto.randomBytes(32).toString('hex');
      }
    }

    await repo.save(connection);

    // ─────────────────────────────────────────────────────────────────
    // NEW: Save to MASTER DB (PhoneTenantMap) for global webhook lookup
    // ─────────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────
    // NEW: Save to MASTER DB (PhoneTenantMap) for global webhook lookup
    // ─────────────────────────────────────────────────────────────────
    console.log(`🔄 Attempting to save PhoneTenantMap: ${data.phoneNumberId} -> ${tenantKey} (userId: ${userId})`);

    const masterDs = this.dbManager.getMasterDataSource();
    if (!masterDs.isInitialized) {
      console.error('❌ Master DataSource is NOT initialized!');
      await masterDs.initialize();
    }

    const mapRepo = masterDs.getRepository(PhoneTenantMap);

    // Check if exists
    let mapEntry = await mapRepo.findOne({ where: { phone: data.phoneNumberId } });
    if (!mapEntry) {
      mapEntry = mapRepo.create({
        phone: data.phoneNumberId,
        tenantKey,
        userId,
      });
    } else {
      mapEntry.tenantKey = tenantKey; // Update if changed
      mapEntry.userId = userId; // Update userId
    }

    await mapRepo.save(mapEntry);
    console.log(`✅ Saved PhoneTenantMap: ${data.phoneNumberId} -> ${tenantKey} (userId: ${userId})`);

    return connection;
  }

  async handleOAuthCallback(code: string, userId: string, tenantKey: string | null, email: string) {
    try {
      console.log('📌 OAuth Callback started for user:', userId);

      // For personal users (tenantKey = null), resolve their actual DB
      let actualTenantKey: string;
      if (!tenantKey) {
        const { tenantKey: resolvedKey } = await this.dbManager.getConnectionForUser({ id: userId, email });
        actualTenantKey = resolvedKey;
        console.log('🔍 Resolved tenantKey for personal user:', actualTenantKey);
      } else {
        actualTenantKey = tenantKey;
      }

      const metaApp = await this.getMetaApp(actualTenantKey);

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
          tenantKey: actualTenantKey,
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
      console.log('[WHATSAPP WEBHOOK RAW]:', JSON.stringify(payload, null, 2));

      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value) return { status: 'ignored' };

      // 1. HANDLE STATUS UPDATES (sent, delivered, failed, read)
      if (value.statuses && value.statuses.length > 0) {
        for (const status of value.statuses) {
          console.log(`📢 [STATUS] Message ${status.id} is now ${status.status} for ${status.recipient_id}`);
          if (status.errors) {
            console.error(`❌ [STATUS ERROR] for ${status.id}:`, JSON.stringify(status.errors, null, 2));
          }
        }
      }

      // 2. HANDLE INCOMING MESSAGES
      if (value.messages || value.statuses) {
        const metadata = value.metadata;
        const phoneNumberId = metadata?.phone_number_id;

        if (!phoneNumberId) {
          console.log('⚠️ WhatsApp webhook missing phone_number_id');
          return { status: 'ignored' };
        }

        // 🔍 GLOBAL LOOKUP: Find tenant by phoneNumberId
        const masterDs = this.dbManager.getMasterDataSource();
        const mapRepo = masterDs.getRepository(PhoneTenantMap);
        const mapEntry = await mapRepo.findOne({ where: { phone: phoneNumberId } });

        if (!mapEntry) {
          console.error(`❌ No tenant found for WhatsApp Number ID: ${phoneNumberId}`);
          return { status: 'tenant_not_found' };
        }

        const tenantKey = mapEntry.tenantKey;
        console.log(`✅ Webhook routed to tenant: ${tenantKey}`);

        // Process messages
        if (value.messages) {
          for (const msg of value.messages) {
            const contact = value.contacts?.find((c: any) => c.wa_id === msg.from);
            const name = contact?.profile?.name || null;

            // 🔍 Extract content for interactive messages
            let content = msg.text?.body || msg.type;
            let metadata: any = null;

            if (msg.type === 'interactive') {
              const interactive = msg.interactive;
              if (interactive.type === 'button_reply') {
                content = interactive.button_reply.title;
                metadata = { button_id: interactive.button_reply.id };
              } else if (interactive.type === 'list_reply') {
                content = interactive.list_reply.title;
                metadata = { list_item_id: interactive.list_reply.id, description: interactive.list_reply.description };
              } else if (interactive.type === 'nfm_reply') {
                // WhatsApp Flow Response
                content = 'Flow Submitted';
                try {
                  metadata = { flow_response: JSON.parse(interactive.nfm_reply.response_json) };
                } catch {
                  metadata = { flow_response_raw: interactive.nfm_reply.response_json };
                }
              }
            } else if (msg.type === 'button') {
              content = msg.button.text;
              metadata = { button_payload: msg.button.payload };
            }

            // 🔍 Find parent message ID locally if context is available
            let parentMessageId: number | undefined = undefined;
            if (msg.context?.id) {
              const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
              const msgRepo = ds.getRepository(Message);
              const parentMsg = await msgRepo.findOne({ where: { whatsapp_message_id: msg.context.id } });
              if (parentMsg) {
                parentMessageId = parentMsg.id;
              }
            }

            await this.teamInboxService.processIncomingMessage({
              tenantKey,
              phoneNumber: msg.from,
              name,
              messageContent: content,
              messageType: msg.type,
              whatsappMessageId: msg.id,
              businessPhoneNumberId: phoneNumberId,
              reaction: msg.reaction ? { messageId: msg.reaction.message_id, emoji: msg.reaction.emoji } : undefined,
              parentMessageId,
              metadata
            });
          }
        }

        return { status: 'success', tenantKey };
      }

      // ─────────────────────────────────────────────────────────────────
      // 2. HANDLE FACEBOOK LEAD ADS (Existing Logic)
      // ─────────────────────────────────────────────────────────────────
      if (value.leadgen_id && value.page_id) {
        const pageId = value.page_id;
        const leadgenId = value.leadgen_id;

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
          adId: value.ad_id,
          createdBy: page.connectedByUserId,
        });

        await leadRepo.save(metaLead);

        return { status: 'success', tenantKey };
      }

      return { status: 'ignored' };
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

  // ─────────────────────────────────────────────────────────────────
  // WEBHOOK URL MANAGEMENT
  // ─────────────────────────────────────────────────────────────────
  async updateWebhookUrl(
    tenantKey: string,
    phoneNumberId: string,
    webhookUrl: string,
  ): Promise<{ webhookUrl: string; webhookToken: string; fullWebhookUrl: string }> {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(MetaConnection);

    const connection = await repo.findOne({ where: { phoneNumberId, active: true } });
    if (!connection) {
      throw new Error('WhatsApp connection not found');
    }

    // Normalize URL (remove trailing slash)
    const normalizedUrl = webhookUrl.replace(/\/$/, '');

    // Ensure token exists
    if (!connection.webhookToken) {
      const crypto = require('crypto');
      connection.webhookToken = crypto.randomBytes(32).toString('hex');
    }

    connection.webhookUrl = normalizedUrl;
    await repo.save(connection);

    // Generate full webhook URL with token as query parameter
    // Include /v1 for API versioning
    const fullWebhookUrl = `${normalizedUrl}/v1/webhook?verify_token=${connection.webhookToken!}`;

    return {
      webhookUrl: normalizedUrl,
      webhookToken: connection.webhookToken!, // Non-null assertion since we ensure it exists above
      fullWebhookUrl,
    };
  }

  async getWebhookConfig(
    tenantKey: string,
    phoneNumberId: string,
  ): Promise<{ webhookUrl: string; webhookToken: string; fullWebhookUrl: string; verified: boolean } | null> {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(MetaConnection);

    const connection = await repo.findOne({ where: { phoneNumberId, active: true } });
    if (!connection || !connection.webhookUrl || !connection.webhookToken) {
      return null;
    }

    // Include /v1 for API versioning
    const fullWebhookUrl = `${connection.webhookUrl}/v1/webhook?verify_token=${connection.webhookToken}`;

    return {
      webhookUrl: connection.webhookUrl,
      webhookToken: connection.webhookToken,
      fullWebhookUrl,
      verified: connection.webhookVerified || false,
    };
  }

  async getWhatsAppTemplates(tenantKey: string, phoneNumberId: string) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(MetaConnection);

    const connection = await repo.findOne({ where: { phoneNumberId, active: true } });
    if (!connection) {
      throw new Error('WhatsApp connection not found');
    }

    const { wabaId, accessToken } = connection;

    try {
      const res = await firstValueFrom(
        this.httpService.get(`https://graph.facebook.com/v20.0/${wabaId}/message_templates`, {
          params: { access_token: accessToken, limit: 100 },
        }),
      );

      return {
        success: true,
        data: res.data.data, // Array of templates
      };
    } catch (error: any) {
      console.error('❌ Failed to fetch WhatsApp templates:', error.response?.data || error.message);
      throw new Error(`Failed to fetch templates: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async createWhatsAppTemplate(tenantKey: string, phoneNumberId: string, templateData: any) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(MetaConnection);

    const connection = await repo.findOne({ where: { phoneNumberId, active: true } });
    if (!connection) {
      throw new Error('WhatsApp connection not found');
    }

    const { wabaId, accessToken } = connection;

    try {
      const res = await firstValueFrom(
        this.httpService.post(
          `https://graph.facebook.com/v20.0/${wabaId}/message_templates`,
          {
            name: templateData.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            category: templateData.category?.toUpperCase() || 'MARKETING',
            language: templateData.language || 'en_US',
            components: templateData.components,
          },
          { params: { access_token: accessToken } },
        ),
      );

      return {
        success: true,
        data: res.data,
      };
    } catch (error: any) {
      const metaError = error.response?.data?.error;
      console.error('❌ Failed to create WhatsApp template:', metaError || error.message);

      if (metaError?.error_subcode === 2388293) {
        throw new Error('Template rejected: Too many variables ({{n}}) compared to the message length. Please add more text or reduce variables.');
      }

      if (metaError?.error_subcode === 2388299) {
        throw new Error('Template rejected: Variables cannot be at the very start or end of the message. Please add some text before and after your variables.');
      }

      throw new Error(`Failed to create template: ${metaError?.message || error.message}`);
    }
  }

  async uploadTemplateMedia(tenantKey: string, phoneNumberId: string, file: Express.Multer.File) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(MetaConnection);

    const connection = await repo.findOne({ where: { phoneNumberId, active: true } });
    if (!connection) throw new Error('WhatsApp connection not found');

    const { accessToken } = connection;

    try {
      // 1. Initial request for upload session
      const initRes = await firstValueFrom(
        this.httpService.post(
          `https://graph.facebook.com/v20.0/app/uploads`,
          null,
          {
            params: {
              access_token: accessToken,
              file_length: file.size,
              file_type: file.mimetype,
            },
          },
        ),
      );

      const uploadId = initRes.data.id;

      // 2. Upload file data
      const uploadRes = await firstValueFrom(
        this.httpService.post(
          `https://graph.facebook.com/v20.0/${uploadId}`,
          file.buffer,
          {
            headers: {
              'Authorization': `OAuth ${accessToken}`,
              'file_offset': '0',
              'Content-Type': 'application/octet-stream',
            },
          },
        ),
      );

      return {
        success: true,
        handle: uploadRes.data.h,
      };
    } catch (error: any) {
      console.error('❌ Failed to upload template media to Meta:', error.response?.data || error.message);
      throw new Error(`Upload failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  async createWhatsAppFlow(tenantKey: string, phoneNumberId: string, flowData: any) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(MetaConnection);

    const connection = await repo.findOne({ where: { phoneNumberId, active: true } });
    if (!connection) throw new Error('WhatsApp connection not found');

    const { wabaId, accessToken } = connection;
    let flowId: string | null = null;

    try {
      // 1. Create Flow Shell
      console.log('🚀 Creating Flow Shell on Meta...');
      // Ensure name uniqueness by adding a short random suffix
      const uniqueName = `${flowData.name.substring(0, 25)}_${Math.random().toString(36).substring(7)}`;

      const flowRes = await firstValueFrom(
        this.httpService.post(
          `https://graph.facebook.com/v20.0/${wabaId}/flows`,
          {
            name: uniqueName,
            categories: flowData.categories || ['OTHER'],
          },
          { params: { access_token: accessToken } },
        ),
      );

      flowId = flowRes.data.id;
      console.log('✅ Flow Shell created with ID:', flowId);

      // 2. Prepare Flow JSON (v6.0 - Meta Official Structure)
      // Reference: https://developers.facebook.com/docs/whatsapp/flows/reference/flowjson

      // Helper: Sanitize screen IDs to only contain letters and underscores (Meta requirement)
      const sanitizeScreenId = (id: string): string => {
        // Remove all numbers, keep only letters and underscores
        return id.replace(/[0-9]/g, '').replace(/[^A-Za-z_]/g, '') || 'SCREEN_DEFAULT';
      };

      // First pass: collect all field names for payload aggregation
      const allFields: { screenId: string; fieldName: string }[] = [];
      flowData.screens.forEach((s: any, idx: number) => {
        const safeId = sanitizeScreenId(s.id || `SCREEN_${String.fromCharCode(65 + idx)}`);
        (s.components || []).forEach((c: any, cIdx: number) => {
          if (['text-input', 'dropdown', 'radio', 'checkbox'].includes(c.type)) {
            allFields.push({ screenId: safeId, fieldName: `field_${idx}_${cIdx}` });
          }
        });
      });

      const metaFlowJson = {
        version: '6.0',
        screens: flowData.screens.map((s: any, idx: number) => {
          const isLast = idx === flowData.screens.length - 1;
          const isFirst = idx === 0;
          const screenId = sanitizeScreenId(s.id || `SCREEN_${String.fromCharCode(65 + idx)}`);
          const nextScreenId = sanitizeScreenId(flowData.screens[idx + 1]?.id || `SCREEN_${String.fromCharCode(65 + idx + 1)}`);

          // Collect fields from PREVIOUS screens (to declare in data property)
          const fieldsFromPreviousScreens = allFields.filter(f => {
            const fieldScreenIdx = parseInt(f.fieldName.split('_')[1]);
            return fieldScreenIdx < idx;
          });

          // Collect fields from THIS screen
          const fieldsFromThisScreen = allFields.filter(f => {
            const fieldScreenIdx = parseInt(f.fieldName.split('_')[1]);
            return fieldScreenIdx === idx;
          });

          // Build the 'data' property - declares fields received from previous screens
          const dataDeclaration: any = {};
          fieldsFromPreviousScreens.forEach(f => {
            dataDeclaration[f.fieldName] = {
              type: 'string',
              '__example__': 'example_value'
            };
          });

          // Separate text elements (go outside Form) from input elements (go inside Form)
          const textElements: any[] = [];
          const formChildren: any[] = [];

          (s.components || []).forEach((c: any, cIdx: number) => {
            const fieldName = `field_${idx}_${cIdx}`;

            if (c.type === 'text') {
              textElements.push({ type: 'TextHeading', text: c.label });
            } else if (c.type === 'text-input') {
              formChildren.push({
                type: 'TextInput',
                label: c.label,
                name: fieldName,
                required: c.required ?? false,
                'input-type': 'text'
              });
            } else if (c.type === 'dropdown') {
              formChildren.push({
                type: 'Dropdown',
                label: c.label,
                name: fieldName,
                required: c.required ?? false,
                'data-source': (c.options || []).map((o: any) => ({
                  id: o.value || o.id || `opt_${Math.random().toString(36).substring(7)}`,
                  title: o.label || o.title || 'Option'
                }))
              });
            } else if (c.type === 'radio') {
              formChildren.push({
                type: 'RadioButtonsGroup',
                label: c.label,
                name: fieldName,
                required: c.required ?? false,
                'data-source': (c.options || []).map((o: any) => ({
                  id: o.value || o.id || `opt_${Math.random().toString(36).substring(7)}`,
                  title: o.label || o.title || 'Option'
                }))
              });
            } else if (c.type === 'checkbox') {
              formChildren.push({
                type: 'CheckboxGroup',
                label: c.label,
                name: fieldName,
                'min-selected-items': c.required ? 1 : 0,
                'max-selected-items': 10,
                'data-source': (c.options || []).map((o: any) => ({
                  id: o.value || o.id || `opt_${Math.random().toString(36).substring(7)}`,
                  title: o.label || o.title || 'Option'
                }))
              });
            }
          });

          // Build the payload for navigation or completion
          let actionPayload: any = {};

          if (isLast) {
            // Final screen: collect data from previous screens + current form
            fieldsFromPreviousScreens.forEach(f => {
              actionPayload[f.fieldName] = `\${data.${f.fieldName}}`;
            });
            fieldsFromThisScreen.forEach(f => {
              actionPayload[f.fieldName] = `\${form.${f.fieldName}}`;
            });
          } else {
            // Intermediate screen: pass previous data + current form to next screen
            fieldsFromPreviousScreens.forEach(f => {
              actionPayload[f.fieldName] = `\${data.${f.fieldName}}`;
            });
            fieldsFromThisScreen.forEach(f => {
              actionPayload[f.fieldName] = `\${form.${f.fieldName}}`;
            });
          }

          // Add Footer inside the Form
          formChildren.push({
            type: 'Footer',
            label: s.buttonLabel || (isLast ? 'Submit' : 'Next'),
            'on-click-action': {
              name: isLast ? 'complete' : 'navigate',
              ...(isLast
                ? { payload: actionPayload }
                : {
                  next: { type: 'screen', name: nextScreenId },
                  payload: actionPayload
                }
              )
            }
          });

          // Build screen structure
          const screenChildren: any[] = [
            ...textElements,
            {
              type: 'Form',
              name: `form_${screenId}`,
              children: formChildren
            }
          ];

          return {
            id: screenId,
            title: s.title || 'Form',
            terminal: isLast,
            ...(isLast ? { success: true } : {}),
            data: isFirst ? {} : dataDeclaration,
            layout: {
              type: 'SingleColumnLayout',
              children: screenChildren
            }
          };
        })
      };

      console.log('🚀 Sending Static Flow JSON (v6.0):', JSON.stringify(metaFlowJson, null, 2));

      // 3. Upload Flow JSON Asset
      const fileBuffer = Buffer.from(JSON.stringify(metaFlowJson));
      const form = new FormData();
      form.append('name', 'flow.json');
      form.append('asset_type', 'FLOW_JSON');
      form.append('file', fileBuffer, { filename: 'flow.json', contentType: 'application/json' });

      await firstValueFrom(
        this.httpService.post(
          `https://graph.facebook.com/v20.0/${flowId}/assets`,
          form,
          { params: { access_token: accessToken }, headers: { ...form.getHeaders() } },
        ),
      );

      console.log('✅ Flow Asset uploaded. Waiting 3s for Meta to process...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 4. Get Validation Errors (for debugging)
      console.log('🔍 Checking for validation errors...');
      try {
        const validationRes = await firstValueFrom(
          this.httpService.get(
            `https://graph.facebook.com/v20.0/${flowId}`,
            { params: { access_token: accessToken, fields: 'validation_errors,status,json_version' } }
          )
        );
        console.log('📋 Flow Status:', validationRes.data.status);
        console.log('📋 JSON Version:', validationRes.data.json_version);
        if (validationRes.data.validation_errors && validationRes.data.validation_errors.length > 0) {
          console.error('❌ VALIDATION ERRORS FOUND:');
          validationRes.data.validation_errors.forEach((err: any, idx: number) => {
            console.error(`   [${idx + 1}] ${JSON.stringify(err)}`);
          });
        } else {
          console.log('✅ No validation errors detected.');
        }
      } catch (valErr: any) {
        console.warn('⚠️ Could not fetch validation status:', valErr.response?.data?.error?.message || valErr.message);
      }

      // 5. Auto-Publish the Flow
      console.log('🚀 Publishing Flow on Meta...');
      await firstValueFrom(
        this.httpService.post(
          `https://graph.facebook.com/v20.0/${flowId}/publish`,
          {},
          { params: { access_token: accessToken } }
        )
      );
      console.log('✅ Flow published successfully!');

      return {
        success: true,
        flowId,
        status: 'PUBLISHED',
        message: 'Flow created and published successfully!'
      };
    } catch (error: any) {
      const subcode = error.response?.data?.error?.error_subcode;

      // Auto-Fix for 4233012: Missing public key
      if (subcode === 4233012) {
        console.log('⚠️ Missing Flow Public Key detected. Attempting to auto-register...');
        try {
          await this.registerFlowEncryptionKey(tenantKey, phoneNumberId);
          console.log('✅ Public Key registered. Retrying Flow publication...');

          // Retry step 4
          await firstValueFrom(
            this.httpService.post(
              `https://graph.facebook.com/v20.0/${flowId}/publish`,
              {},
              { params: { access_token: accessToken } }
            )
          );

          return {
            success: true,
            flowId,
            status: 'PUBLISHED',
            message: 'Flow created and published successfully (applied encryption key fix)!'
          };
        } catch (innerError: any) {
          console.error('❌ Failed to auto-register Flow Public Key:', innerError.response?.data?.error || innerError.message);
        }
      }

      console.error('❌ Meta API Error Detail:', error.response?.data?.error || error.message);
      const metaMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`Flow API Error [${subcode || 'N/A'}]: ${metaMsg}`);
    }
  }

  /**
   * Generates a 2048-bit RSA key pair and registers the public key with Meta
   * for WhatsApp Flows encryption.
   */
  private async registerFlowEncryptionKey(tenantKey: string, phoneNumberId: string) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = ds.getRepository(MetaConnection);
    const connection = await repo.findOne({ where: { phoneNumberId, active: true } });
    if (!connection) throw new Error('WhatsApp connection not found');

    const { accessToken } = connection;

    // 1. Generate RSA Key Pair (2048-bit)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    // 2. Register Public Key with Meta
    await firstValueFrom(
      this.httpService.post(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/whatsapp_business_encryption`,
        { business_public_key: publicKey },
        { params: { access_token: accessToken } }
      )
    );

    // 3. Save key pair to database for later decryption
    connection.flowPublicKey = publicKey;
    connection.flowPrivateKey = privateKey;
    await repo.save(connection);
  }
}
