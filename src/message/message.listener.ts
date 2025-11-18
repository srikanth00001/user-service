// src/message/message.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import { MessageWithSender } from './types/message-with-sender.interface';

@Injectable()
export class MessageListener {
  private readonly logger = new Logger(MessageListener.name);

  constructor(private readonly whatsAppService: WhatsAppService) {}

private formatPhoneNumber(phone: string): string {
  if (!phone) throw new Error('Phone number missing');
  const digits = phone.replace(/\D/g, ''); // remove non-digit characters
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
}) {
  const { message, phoneNumber } = payload;
  const formattedPhone = this.formatPhoneNumber(phoneNumber);

  try {
    if (!message.whatsapp_message_id && message.type === 'text') {
      const whatsappId = await this.whatsAppService.sendTextMessage(
        formattedPhone,
        message.content.trim()
      );

      this.logger.log(`WhatsApp message sent successfully: ${whatsappId}`);
    }
  } catch (err) {
    this.logger.error(`Error sending WhatsApp message: ${err.message}`, err.response?.data || '');
  }
}

}
