// src/webhook/webhook.controller.ts
import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpException,
  HttpStatus,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { TeamInboxService } from 'src/team-inbox/team-inbox.service';
import { DatabaseManager } from 'src/common/database/database.manager';
import { Message } from 'src/message/entities/message.entity';
import { extractTenantDomain } from 'src/common/tenant/tenant.utils';

interface Reaction {
  messageId: string;
  emoji: string;
}

@Controller('webhook')
export class WebhookController implements OnModuleInit {
  private readonly logger = new Logger(WebhookController.name);
  private readonly PERSONAL_DOMAIN = 'digiwebspot';

  constructor(
    private readonly teamInboxService: TeamInboxService,
    private readonly dbManager: DatabaseManager,
  ) {}

  async onModuleInit() {
    await this.ensureInitialDigiwebspotDb();
  }

  private async ensureInitialDigiwebspotDb() {
    try {
      await this.dbManager.getOrCreateTenantConnection(`${this.PERSONAL_DOMAIN}_1`);
      this.logger.log('Initial digiwebspot_1 database ensured.');
    } catch (error) {
      this.logger.error('Failed to initialize digiwebspot_1', error.stack);
    }
  }

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

  @Post()
  async handleIncomingMessage(@Body() body: any) {
    try {
      this.logger.log('Webhook received:', JSON.stringify(body, null, 2));

      const entry = body.entry?.[0]?.changes?.[0]?.value;
      if (!entry?.messages?.length) {
        return { success: true, message: 'No messages' };
      }

      const businessPhoneId = entry.metadata?.phone_number_id;
      if (!businessPhoneId) {
        throw new HttpException('Missing phone_number_id', HttpStatus.BAD_REQUEST);
      }

      const tenantKey = await this.resolveTenantKeyFromPhoneId(businessPhoneId);
      const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);

      for (const message of entry.messages) {
        const senderPhone = message.from;
        let messageContent = message.text?.body || 'Unknown';
        let messageType = message.type || 'text';
        let reaction: Reaction | undefined = undefined; // ← FIXED: proper type + init
        const whatsappMessageId = message.id;
        let parentMessageId: number | undefined;

        // === HANDLE REPLY (context.id) ===
        if (message.context?.id) {
          const messageRepo = dataSource.getRepository(Message);
          const parentMsg = await messageRepo.findOne({
            where: { whatsapp_message_id: message.context.id },
          });
          if (parentMsg) {
            parentMessageId = parentMsg.id;
          }
        }

        // === HANDLE REACTION ===
        if (message.type === 'reaction' && message.reaction?.message_id && message.reaction?.emoji) {
          reaction = {
            messageId: message.reaction.message_id,
            emoji: message.reaction.emoji,
          };
          messageContent = reaction.emoji; // ← SAFE: reaction is defined
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
          messageContent = message.interactive.list_reply?.title || 'List reply';
        } else if (message.interactive?.type === 'button_reply') {
          messageContent = message.interactive.button_reply?.title || 'Button reply';
        }

        const senderName = entry.contacts?.[0]?.profile?.name || null;

        this.logger.log('Processing message:', {
          tenantKey,
          senderPhone,
          messageType,
          content: messageContent,
          reaction,
          whatsappMessageId,
          parentMessageId,
        });

        await this.teamInboxService.processIncomingMessage({
          tenantKey,
          phoneNumber: senderPhone,
          name: senderName,
          messageContent,
          messageType,
          whatsappMessageId,
          parentMessageId,
          reaction, // ← Type-safe: Reaction | undefined
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

  // ─────────────────────────────────────────────────────────────────────
  //  RESOLVE TENANT FROM PHONE NUMBER ID
  // ─────────────────────────────────────────────────────────────────────
  private async resolveTenantKeyFromPhoneId(phoneNumberId: string): Promise<string> {
    const master = this.dbManager.getMasterDataSource();

    // 1. Business User
    const businessUser = await master
      .createQueryBuilder()
      .select('bu')
      .from('business_users', 'bu')
      .where('bu.whatsapp_business_phone_id = :id', { id: phoneNumberId })
      .getOne();

    if (businessUser?.email) {
      const domain = extractTenantDomain(businessUser.email);
      return this.normalizeDomain(domain); // ← Use helper
    }

    // 2. Fallback: Personal User
    return `${this.PERSONAL_DOMAIN}_1`;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  HELPER: normalize domain (public or private-safe)
  // ─────────────────────────────────────────────────────────────────────
  private normalizeDomain(domain: string): string {
    return domain.replace(/\./g, '_').toLowerCase();
  }
}