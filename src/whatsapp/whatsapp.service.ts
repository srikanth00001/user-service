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
  private readonly defaultPhoneNumberId = '677562115441844';
  private readonly defaultAccessToken = 'EAAQZAtXAOD0gBQDAe7pr4VXyFGlQ5pZAUxGjqGJcyTn5kKZBTdXDWHYPqxZAVrQZBXSN6acP83O05xtfYexN284mfgZC1Y4DWlwS9xovlyrxmpHQHYilGbZBEq7zUCgWZCJs5UFpwLzl04kUhPQ1pS1lnw0u3b1l54sWNoiX63iNFQwdcQZCqen4inEyIc2cOsdXCs9J3AdB01mWTlA9Y7jrbXr1vj4WSkgbhCFP5MZAnrzZCZBCdMn7h83kMbGXI6SMG8pBD1SDuLgZAxJrwLZCRPtZBdMxj3c';

  private get baseUrl() {
    return `https://graph.facebook.com/${this.API_VERSION}`;
  }

  private getHeaders(contentType = 'application/json', overrideAccessToken?: string) {
    const token = overrideAccessToken || this.defaultAccessToken;
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    };
  }

  private getPhoneNumberId(overridePhoneNumberId?: string) {
    return overridePhoneNumberId || this.defaultPhoneNumberId;
  }

  // TEXT MESSAGE – 100% WORKING ON v23+
  async sendTextMessage(to: string, content: string, opts?: { phoneNumberId?: string; accessToken?: string }): Promise<string> {
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
    return this.sendPayload(payload, opts);
  }

  // REPLY MESSAGE
  async sendReplyMessage(to: string, content: string, replyToMessageId: string, opts?: { phoneNumberId?: string; accessToken?: string }): Promise<string> {
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
    return this.sendPayload(payload, opts);
  }

  // MEDIA MESSAGE
  async sendMediaMessage(
    to: string,
    mediaId: string,
    type: 'image' | 'video' | 'document' | 'audio',
    caption?: string,
    opts?: { phoneNumberId?: string; accessToken?: string },
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

    return this.sendPayload(payload, opts);
  }

  // UPLOAD FROM FILE PATH ← THIS IS THE ONE YOU NEED FOR MessageService.upload()
  async uploadMedia(filePath: string, mediaType: 'image' | 'video' | 'document' | 'audio', opts?: { phoneNumberId?: string; accessToken?: string }): Promise<string> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', this.getMimeType(mediaType));
    form.append('file', fs.createReadStream(filePath), {
      filename: require('path').basename(filePath),
      contentType: this.getMimeType(mediaType),
    });

    const res = await axios.post(`${this.baseUrl}/${this.getPhoneNumberId(opts?.phoneNumberId)}/media`, form, {
      headers: { ...this.getHeaders(undefined, opts?.accessToken), ...form.getHeaders() },
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
    opts?: { phoneNumberId?: string; accessToken?: string },
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

    const res = await axios.post(`${this.baseUrl}/${this.getPhoneNumberId(opts?.phoneNumberId)}/media`, form, {
      headers: { ...this.getHeaders(undefined, opts?.accessToken), ...form.getHeaders() },
      timeout: 90_000,
      maxBodyLength: Infinity,
    });

    return res.data.id;
  }

  async sendReactionMessage(
  phoneNumber: string,
  messageId: string,
  emoji: string,
  opts?: { phoneNumberId?: string; accessToken?: string },
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
    const result = await this.sendPayload(payload, opts);

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

  async getMediaUrl(mediaId: string, opts?: { accessToken?: string }): Promise<string> {
    const res = await axios.get(`${this.baseUrl}/${mediaId}`, {
      headers: this.getHeaders(undefined, opts?.accessToken),
      params: { fields: 'url' },
    });
    return res.data.url;
  }

  private async sendPayload(payload: any, opts?: { phoneNumberId?: string; accessToken?: string }): Promise<string> {
    try {
      const res = await axios.post(`${this.baseUrl}/${this.getPhoneNumberId(opts?.phoneNumberId)}/messages`, payload, {
        headers: this.getHeaders(undefined, opts?.accessToken),
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
