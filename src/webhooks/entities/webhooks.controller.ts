// src/webhook/webhook.controller.ts
import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { TeamInboxService } from 'src/team-inbox/team-inbox.service';
import { DatabaseManager } from 'src/common/database/database.manager';
import { Message } from 'src/message/entities/message.entity';
import { Lead } from 'src/lead_management/leads/entities/lead.entity';
import { MetaConnection } from 'src/lead_management/facebook/entities/meta-connection.entity';
import { PhoneTenantMap } from 'src/lead_management/leads/entities/phone-tenant-map.entity';

interface Reaction {
  messageId: string;
  emoji: string;
}

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly teamInboxService: TeamInboxService,
    private readonly dbManager: DatabaseManager,
  ) { }

  // ───────────────────────────────────────────────
  // VERIFY WEBHOOK
  // ───────────────────────────────────────────────
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return challenge;
    }
    throw new HttpException('Verification failed', HttpStatus.FORBIDDEN);
  }

  // ───────────────────────────────────────────────
  // HANDLE INCOMING MESSAGE
  // ───────────────────────────────────────────────
  @Post()
  async handleIncomingMessage(@Body() body: any) {
    try {
      this.logger.log('Webhook received:', JSON.stringify(body, null, 2));

      const entry = body.entry?.[0]?.changes?.[0]?.value;
      if (!entry?.messages?.length) {
        return { success: true, message: 'No messages' };
      }

      const businessPhoneId = entry.metadata?.phone_number_id;
      const senderPhone = entry.contacts?.[0]?.wa_id;

      if (!senderPhone) {
        throw new HttpException('Missing sender wa_id', HttpStatus.BAD_REQUEST);
      }

      // Resolve tenant database
      const tenantKey = await this.resolveTenantKey(businessPhoneId, senderPhone);

      // Create tenant connection
      const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);

      // Process messages
      for (const message of entry.messages) {
        const senderPhone = message.from;
        let messageContent = message.text?.body || 'Unknown';
        let messageType = message.type || 'text';
        let reaction: Reaction | undefined;
        const whatsappMessageId = message.id;
        let parentMessageId: number | undefined;

        // === HANDLE REPLY (context.id) ===
        if (message.context?.id) {
          const messageRepo = dataSource.getRepository(Message);
          const parentMsg = await messageRepo.findOne({
            where: { whatsapp_message_id: message.context.id },
          });
          if (parentMsg) parentMessageId = parentMsg.id;
        }

        // === HANDLE REACTION ===
        if (message.type === 'reaction') {
          reaction = {
            messageId: message.reaction?.message_id,
            emoji: message.reaction?.emoji,
          };
          messageContent = reaction.emoji;
          messageType = 'reaction';
        }

        // === HANDLE MEDIA ===
        let mediaUrl: string | undefined;
        let filename: string | undefined;

        if (['image', 'video', 'document', 'audio', 'sticker'].includes(message.type)) {
          const media = message[message.type];
          const mediaId = media?.id;

          if (mediaId) {
            try {
              // Get WhatsApp credentials for this tenant
              const metaRepo = dataSource.getRepository(this.getMetaConnectionEntity());
              const metaConn = await metaRepo.findOne({
                where: { phoneNumberId: businessPhoneId, tenantKey }
              });

              if (metaConn) {
                // Get temporary media URL from WhatsApp
                const tempUrl = await this.getMediaUrl(mediaId, metaConn.accessToken);

                // Download media
                const mediaBuffer = await this.downloadMediaFromWhatsApp(tempUrl, metaConn.accessToken);

                // Save permanently
                const fs = require('fs/promises');
                const path = require('path');
                const uploadsDir = path.join(process.cwd(), 'uploads', tenantKey);
                await fs.mkdir(uploadsDir, { recursive: true });

                const timestamp = Date.now();
                const ext = this.getExtensionForMediaType(message.type);
                filename = `${timestamp}_whatsapp_media${ext}`;
                const filePath = path.join(uploadsDir, filename);

                await fs.writeFile(filePath, mediaBuffer);

                // Set permanent URL
                mediaUrl = `/uploads/${tenantKey}/${filename}`;
                messageContent = media?.caption || `${message.type} file`;
              }
            } catch (error) {
              this.logger.error('Failed to download media:', error);
              messageContent = `Media: ${mediaId}`;
            }
          } else {
            messageContent = 'Media message';
          }

          messageType = message.type;
        }

        // === INTERACTIVE MESSAGES ===
        if (message.interactive?.type === 'list_reply') {
          messageContent = message.interactive.list_reply?.title;
        }
        if (message.interactive?.type === 'button_reply') {
          messageContent = message.interactive.button_reply?.title;
        }

        const senderName = entry.contacts?.[0]?.profile?.name || null;

        // PROCESS
        await this.teamInboxService.processIncomingMessage({
          tenantKey,
          phoneNumber: senderPhone,
          name: senderName,
          messageContent,
          messageType,
          whatsappMessageId,
          parentMessageId,
          reaction,
          businessPhoneNumberId: businessPhoneId,
          mediaUrl,
          filename,
        });
      }

      return { success: true, message: 'Messages processed' };
    } catch (error) {
      this.logger.error('Webhook failed', error.stack);
      throw new HttpException(
        `Webhook error: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ───────────────────────────────────────────────
  // TENANT RESOLUTION LOGIC (CORRECTED)
  // ───────────────────────────────────────────────
  /**
   * Normalize phone number for lookup
   * Removes country code (91) to match database storage format
   */
  private normalizePhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, ''); // Remove non-digits
    // If starts with 91 (India country code) and has more than 10 digits, remove it
    if (digits.startsWith('91') && digits.length > 10) {
      return digits.substring(2); // Remove '91' prefix
    }
    return digits;
  }

  private async resolveTenantKey(
    phoneNumberId: string | undefined,
    phone: string,
  ): Promise<string> {
    // 1) PRIMARY: Lookup business phoneNumberId in PhoneTenantMap (MASTER DB)
    // This is the CORRECT approach - business WhatsApp numbers are unique per tenant
    if (phoneNumberId) {
      try {
        const masterDs = this.dbManager.getMasterDataSource();
        const phoneTenantRepo = masterDs.getRepository(PhoneTenantMap);

        const mapping = await phoneTenantRepo.findOne({ where: { phone: phoneNumberId } });
        if (mapping) {
          this.logger.log(`✅ Tenant resolved via PhoneTenantMap (business number): ${mapping.tenantKey} (phoneNumberId: ${phoneNumberId})`);
          return mapping.tenantKey;
        }
        this.logger.log(`⚠️ No PhoneTenantMap entry found for business phoneNumberId: ${phoneNumberId}`);
      } catch (error) {
        this.logger.error('Failed to lookup PhoneTenantMap:', error);
      }
    }

    // 2) Lookup MetaConnection across tenants (fallback)
    if (phoneNumberId) {
      for (const [tenantKey, conn] of (this.dbManager as any).connections.entries()) {
        try {
          const repo = conn.dataSource.getRepository(MetaConnection);
          const found = await repo.findOne({ where: { phoneNumberId, active: true } });
          if (found) {
            this.logger.log(`Tenant resolved via MetaConnection: ${tenantKey}`);
            return tenantKey;
          }
        } catch { }
      }
      // Env-based static map as secondary
      const mapRaw = process.env.WHATSAPP_TENANT_MAP;
      if (mapRaw) {
        try {
          const map = JSON.parse(mapRaw);
          if (map[phoneNumberId]) {
            this.logger.log(`Tenant resolved via WHATSAPP_TENANT_MAP: ${map[phoneNumberId]}`);
            return map[phoneNumberId];
          }
        } catch { }
      }
    }

    // 3) DIRECT SINGLE TENANT OVERRIDE
    if (process.env.WHATSAPP_TENANT_KEY) {
      this.logger.log(`Tenant resolved via WHATSAPP_TENANT_KEY: ${process.env.WHATSAPP_TENANT_KEY}`);
      return process.env.WHATSAPP_TENANT_KEY;
    }

    // 4) Scan for lead phone in all tenant DBs (LAST RESORT - should rarely be needed)
    const normalizedPhone = this.normalizePhoneNumber(phone);
    this.logger.log(`⚠️ Falling back to lead phone scan: ${normalizedPhone} (original: ${phone})`);

    for (const [tenantKey, conn] of (this.dbManager as any).connections.entries()) {
      try {
        const repo = conn.dataSource.getRepository(Lead);
        const found = await repo.findOne({ where: { phone: normalizedPhone } });
        if (found) {
          this.logger.log(`Tenant resolved via lead phone lookup: ${tenantKey}`);
          return tenantKey;
        }
      } catch { }
    }

    // 5) FINAL FALLBACK
    this.logger.error(`❌ No tenant found for phoneNumberId: ${phoneNumberId}, customer phone: ${phone}`);
    this.logger.error(`❌ Using fallback tenant: ${process.env.DEFAULT_TENANT_KEY || 'amazon_com'}`);
    this.logger.error(`❌ This means the business WhatsApp number is not connected to any tenant!`);
    return process.env.DEFAULT_TENANT_KEY || 'amazon_com';
  }

  private getMetaConnectionEntity() {
    return require('../../lead_management/facebook/entities/meta-connection.entity').MetaConnection;
  }

  private async getMediaUrl(mediaId: string, accessToken: string): Promise<string> {
    const axios = require('axios');
    const res = await axios.get(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: { fields: 'url' },
    });
    return res.data.url;
  }

  private async downloadMediaFromWhatsApp(mediaUrl: string, accessToken: string): Promise<Buffer> {
    const axios = require('axios');
    const res = await axios.get(mediaUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      responseType: 'arraybuffer',
      timeout: 60_000,
    });
    return Buffer.from(res.data);
  }

  private getExtensionForMediaType(type: string): string {
    const extensions = {
      image: '.jpg',
      video: '.mp4',
      audio: '.mp3',
      document: '.pdf',
      sticker: '.webp',
    };
    return extensions[type] || '.bin';
  }
}
