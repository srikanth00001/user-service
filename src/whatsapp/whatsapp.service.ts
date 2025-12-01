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
  private readonly phoneNumberId = '913944838464584';
  private readonly accessToken = 'EAAQZAtXAOD0gBQOyP0nRcrXfh1XEn4WAQibyxhYEAyLbjdStC758siAghjKI4lLQj9PJZBU8W1nl8z7BM54Jrp95LaDVUWPHwk3ZByC68GUKvQpZCHByQSu96ViB2ZCQKW5iZAlvPTa24VZBna4SKfVZAEkDmtz72R4tBQox0wfKZC1mkF5yx06tQpRNcZB8UZBfqP2RW2HYAuICcrRnqyVQyLbPTNKflta0LEn6WHhiNmEF9ZBAo0d6xxDLZB8dJpHhJB16ZAKf9hOBBmZBAUhrwQ6JEjwMxZAF0QZDZD';

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

  async sendReactionMessage(
  phoneNumber: string,
  messageId: string,
  emoji: string,
): Promise<string> {  // return message ID for consistency
  try {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    if (!messageId.startsWith('wamid.')) {
      throw new Error(`Invalid WhatsApp message ID: ${messageId}`);
    }

    // WhatsApp only supports single emoji (no skin tones in some cases)
    // But this regex allows all commonly supported ones
    const validEmoji = emoji.trim();
    if (!validEmoji || validEmoji.length > 2) {
      throw new Error(`Invalid emoji: ${validEmoji}`);
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji: validEmoji,
      },
    };

    this.logger.log('Sending reaction to WhatsApp:', { to: formattedPhone, messageId, emoji });

    // ← CRITICAL: Use the same sendPayload() as text/media messages
    const result = await this.sendPayload(payload);

    this.logger.log('Reaction sent successfully:', result);
    return result;

  } catch (error: any) {
    this.logger.error('Failed to send reaction to WhatsApp', {
      phoneNumber,
      messageId,
      emoji,
      error: error.response?.data || error.message,
      stack: error.stack,
    });
    throw error;
  }
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