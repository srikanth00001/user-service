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
  ) {}

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
        if (['image', 'video', 'document', 'audio', 'sticker'].includes(message.type)) {
          const media = message[message.type];
          messageContent = media?.id ? `Media: ${media.id}` : 'Media message';
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
  private async resolveTenantKey(
    phoneNumberId: string | undefined,
    phone: string,
  ): Promise<string> {
    // 1) Lookup MetaConnection across tenants
    if (phoneNumberId) {
      for (const [tenantKey, conn] of (this.dbManager as any).connections.entries()) {
        try {
          const repo = conn.dataSource.getRepository(MetaConnection);
          const found = await repo.findOne({ where: { phoneNumberId, active: true } });
          if (found) return tenantKey;
        } catch {}
      }
      // Env-based static map as secondary
      const mapRaw = process.env.WHATSAPP_TENANT_MAP;
      if (mapRaw) {
        try {
          const map = JSON.parse(mapRaw);
          if (map[phoneNumberId]) return map[phoneNumberId];
        } catch {}
      }
    }

    // 2) DIRECT SINGLE TENANT OVERRIDE
    if (process.env.WHATSAPP_TENANT_KEY) return process.env.WHATSAPP_TENANT_KEY;

    // 3) Scan for lead phone in all tenant DBs
    for (const [tenantKey, conn] of (this.dbManager as any).connections.entries()) {
      try {
        const repo = conn.dataSource.getRepository(Lead);
        const found = await repo.findOne({ where: { phone } });
        if (found) return tenantKey;
      } catch {}
    }

    // 4) FINAL FALLBACK
    return process.env.DEFAULT_TENANT_KEY || 'amazomn_com';
  }
}
