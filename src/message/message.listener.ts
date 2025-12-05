// src/message/message.listener.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import { MessageWithSender } from './types/message-with-sender.interface';
import { DatabaseManager } from 'src/common/database/database.manager';
import { MetaConnection } from 'src/lead_management/facebook/entities/meta-connection.entity';

@Injectable()
export class MessageListener {
  private readonly logger = new Logger(MessageListener.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly dbManager: DatabaseManager,
  ) { }

  private formatPhoneNumber(phone: string): string {
    if (!phone) throw new Error('Phone number missing');
    const digits = phone.replace(/\\D/g, ''); // remove non-digit characters
    if (!digits.startsWith('91')) {          // assuming India for example
      return `+91${digits}`;
    }
    return `+${digits}`;
  }

  @OnEvent('message.created')
  async handleMessageCreated(payload: {
    message: MessageWithSender;
    conversationId: number;
    tenantKey: string;
    phoneNumber: string;
    businessPhoneNumberId?: string;
  }) {
    const { message, phoneNumber, tenantKey, businessPhoneNumberId } = payload;
    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    try {
      if (!message.whatsapp_message_id && message.type === 'text') {
        // Fetch WhatsApp credentials
        if (!businessPhoneNumberId) {
          this.logger.warn('No businessPhoneNumberId provided, skipping WhatsApp send');
          return;
        }

        const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
        const metaRepo = dataSource.getRepository(MetaConnection);
        const metaConn = await metaRepo.findOne({
          where: { phoneNumberId: businessPhoneNumberId }
        });

        if (!metaConn) {
          this.logger.warn(`WhatsApp connection not found for phoneNumberId: ${businessPhoneNumberId}`);
          return;
        }

        const opts = {
          phoneNumberId: metaConn.phoneNumberId,
          accessToken: metaConn.accessToken
        };

        const whatsappId = await this.whatsAppService.sendTextMessage(
          formattedPhone,
          message.content.trim(),
          opts
        );

        this.logger.log(`WhatsApp message sent successfully: ${whatsappId}`);
      }
    } catch (err) {
      this.logger.error(`Error sending WhatsApp message: ${err.message}`, err.response?.data || '');
    }
  }

}
