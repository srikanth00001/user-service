// src/whatsapp/whatsapp.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs/promises';

@Injectable()
export class WhatsAppService {
  private phoneNumberId: string = process.env.WHATSAPP_PHONE_NUMBER_ID || '848174611702595';
  private accessToken: string = process.env.WHATSAPP_TOKEN!;

  private getHeaders() {
    if (!this.accessToken) throw new Error('WhatsApp token is missing.');
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async sendTextMessage(phoneNumber: string, content: string): Promise<{ messageId: string }> {
    const payload = {
      messaging_product: 'whatsapp',
      to: phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`,
      type: 'text',
      text: { body: content },
    };

    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${this.phoneNumberId}/messages`,
      payload,
      { headers: this.getHeaders() },
    );

    return { messageId: response.data.messages[0].id };
  }

  async sendReplyMessage(phoneNumber: string, content: string, parentMessageId: string): Promise<{ messageId: string }> {
    const payload = {
      messaging_product: 'whatsapp',
      to: phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`,
      type: 'text',
      text: { body: content },
      context: { message_id: parentMessageId },
    };

    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${this.phoneNumberId}/messages`,
      payload,
      { headers: this.getHeaders() },
    );

    return { messageId: response.data.messages[0].id };
  }

  async uploadMedia(filePath: string, mediaType: 'image' | 'video' | 'document' | 'audio') {
    const fileStream = await fs.open(filePath, 'r').then((f) => f.createReadStream());
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', fileStream);
    form.append('type', mediaType);

    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${this.phoneNumberId}/media`,
      form,
      { headers: { ...this.getHeaders(), ...form.getHeaders() } },
    );

    return response.data.id;
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    const response = await axios.get(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: this.getHeaders(),
      params: { fields: 'url' },
    });
    return response.data.url;
  }
}