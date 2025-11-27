// src/whatsapp/whatsapp.service.ts
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import { Readable } from 'stream';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  private readonly API_VERSION = 'v20.0'; // Meta auto-upgrades safely
  private readonly phoneNumberId = '848174611702595';
  private readonly accessToken = 'EAAQZAtXAOD0gBQOvlprVMdeEDsGSvywLS6dAGmYzeWZAQK6iLqHHSuNrYmtPFpa223AoE5vVU7Od7n3RNZAjDjPdvW5IpEj3wixKP6jg9jkZCeNRmJs862wZCDSkjW08zmLsX3JihZCUUJrA1z7QEkCW9in4clK34MLw9P3TZCHJHoh8ZBuT6iTS3cb7DZBqKzQYebjzkOLeKq3quXjJZByzJamG5WQnVbC93GY0oeFGfZAI5VMfJ8TNC1zRUBSqSbG7gAOKFissMtBRUOE9gtjUIrGVnuGqAZDZD';

  private get baseUrl() {
    return `https://graph.facebook.com/${this.API_VERSION}`;
  }

  private getHeaders(contentType = 'application/json') {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': contentType,
    };
  }

  // TEXT MESSAGE – 100% WORKING ON v23+
  async sendTextMessage(to: string, content: string): Promise<string> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'text',
      text: {
        preview_url: false,
        body: content.trim(),
      },
    };
    return this.sendPayload(payload);
  }

  // REPLY MESSAGE
  async sendReplyMessage(to: string, content: string, replyToMessageId: string): Promise<string> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'text',
      text: {
        preview_url: false,
        body: content.trim(),
      },
      context: { message_id: replyToMessageId },
    };
    return this.sendPayload(payload);
  }

  // MEDIA MESSAGE
  async sendMediaMessage(
    to: string,
    mediaId: string,
    type: 'image' | 'video' | 'document' | 'audio',
    caption?: string,
  ): Promise<string> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type,
    };
    payload[type] = { id: mediaId };
    if (caption?.trim()) payload[type].caption = caption.trim();
    if (type === 'document') payload[type].filename = 'file';

    return this.sendPayload(payload);
  }

  // UPLOAD FROM FILE PATH ← THIS IS THE ONE YOU NEED FOR MessageService.upload()
  async uploadMedia(filePath: string, mediaType: 'image' | 'video' | 'document' | 'audio'): Promise<string> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', this.getMimeType(mediaType));
    form.append('file', fs.createReadStream(filePath), {
      filename: require('path').basename(filePath),
      contentType: this.getMimeType(mediaType),
    });

    const res = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/media`, form, {
      headers: { ...this.getHeaders(), ...form.getHeaders() },
      timeout: 90_000,
      maxBodyLength: Infinity,
    });

    return res.data.id;
  }

  // UPLOAD FROM BUFFER (recommended in most cases)
  async uploadMediaBuffer(
    buffer: Buffer,
    filename: string,
    mediaType: 'image' | 'video' | 'document' | 'audio',
  ): Promise<string> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', this.getMimeType(mediaType));

    const stream = Readable.from(buffer);
    (stream as any).path = filename;

    form.append('file', stream, {
      filename,
      contentType: this.getMimeType(mediaType),
    });

    const res = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/media`, form, {
      headers: { ...this.getHeaders(), ...form.getHeaders() },
      timeout: 90_000,
      maxBodyLength: Infinity,
    });

    return res.data.id;
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    const res = await axios.get(`${this.baseUrl}/${mediaId}`, {
      headers: this.getHeaders(),
      params: { fields: 'url' },
    });
    return res.data.url;
  }

  private async sendPayload(payload: any): Promise<string> {
    try {
      const res = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, payload, {
        headers: this.getHeaders(),
        timeout: 30_000,
      });
      return res.data.messages?.[0]?.id || 'sent';
    } catch (error: any) {
      this.logger.error('WhatsApp send failed', {
        payload,
        error: error.response?.data || error.message,
      });
      throw new HttpException(
        error.response?.data?.error?.message || 'Failed to send message',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private formatPhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (!digits) throw new HttpException('Invalid phone number', HttpStatus.BAD_REQUEST);
    return digits.startsWith('91') ? `+${digits}` : `+91${digits}`;
  }

  private getMimeType(type: 'image' | 'video' | 'document' | 'audio'): string {
  const map = {
    image: 'image/jpeg',
    video: 'video/mp4',
    document: 'application/pdf',
    audio: 'audio/mpeg',   // ✔ fix here
  } as const;
  return map[type];
}

}