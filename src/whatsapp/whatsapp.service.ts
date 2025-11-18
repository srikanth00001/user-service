// src/whatsapp/whatsapp.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs/promises';

@Injectable()
export class WhatsAppService {
  private phoneNumberId: string = '848174611702595';
  private accessToken: string = 'EAAQZAtXAOD0gBP8NgQTRibIvv6ghMFILyegB3IBgECqrP8DkR26fOSHmkZATdOdGH86Xh7A2LntUNiNv8F1U7miGBTs6KZBfZBmc9qwhQoudoPuFjpSB2GSr8EMJiBiB6ZAW5wUTSaY6wFvyoz3MHhogSeUKUjSPK8iFZArtULtMIcIKAkZABtWwie7zgynF1vb6Sejj09UdEhVFLZAaAedECV4BZBIKiowqleTzj615E7bRc9dHwQvpEyBsb3gPO8qXA34bl2plfxowJf8Nc70YMQCNe';

  private getHeaders() {
    if (!this.accessToken) throw new Error('WhatsApp token is missing.');
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async sendTextMessage(phoneNumber: string, content: string): Promise<{ messageId: string }> {
  // Trim content
  const trimmedContent = content?.trim();
  if (!trimmedContent) {
    throw new HttpException('Cannot send empty WhatsApp message', HttpStatus.BAD_REQUEST);
  }

  // Normalize phone number
  const formattedNumber = this.formatPhoneNumber(phoneNumber);

  const payload = {
    messaging_product: 'whatsapp',
    to: formattedNumber,
    type: 'text',
    text: { body: trimmedContent },
  };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${this.phoneNumberId}/messages`,
      payload,
      { headers: this.getHeaders() },
    );

    return { messageId: response.data.messages[0].id };
  } catch (err) {
    console.error('WhatsApp API error:', err.response?.data || err.message);
    throw new HttpException('Failed to send WhatsApp message', HttpStatus.BAD_REQUEST);
  }
}

private formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  if (!digits) throw new HttpException('Invalid phone number', HttpStatus.BAD_REQUEST);
  return `+${digits}`;
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

  async uploadMediaBuffer(
  buffer: Buffer,
  filename: string,
  mediaType: 'image' | 'video' | 'document' | 'audio'
): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', buffer, {
    filename,
    contentType: this.getMimeType(mediaType),
  });
  form.append('type', mediaType);

  const response = await axios.post(
    `https://graph.facebook.com/v21.0/${this.phoneNumberId}/media`,
    form,
    { headers: { ...this.getHeaders(), ...form.getHeaders() } },
  );

  return response.data.id;
}

private getMimeType(type: 'image' | 'video' | 'document' | 'audio'): string {
  const map: Record<typeof type, string> = {
    image: 'image/jpeg',
    video: 'video/mp4',
    audio: 'audio/mp3',
    document: 'application/pdf',
  };
  return map[type];
}

}