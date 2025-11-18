import {
  Controller,
  Post,
  Body,
  Res,
  HttpStatus,
  Param,
} from '@nestjs/common';
import type { Response } from 'express';
import { GoogleAdsService } from './google-ads.service';
import { DatabaseManager } from '../../common/database/database.manager';
import { sha256, base64url } from 'src/lib/crypto-utils';
import { Campaign } from '../campaigns/entities/campaign.entity';

@Controller({ path: 'google-ads', version: '1' })
export class GoogleAdsController {
  constructor(
    private readonly googleAdsService: GoogleAdsService,
    private readonly dbManager: DatabaseManager,
  ) {}

  @Post('webhook/:token')
async webhookHandler(
  @Param('token') token: string,
  @Body() payload: any,
  @Res() res: Response,
) {
  try {
    if (!token) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', message: 'Missing token' });
    }

    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', message: 'Invalid token format' });
    }

    const decoded = Buffer.from(encodedPayload, 'base64').toString('utf8');
    const [userId, email, campaignName] = decoded.split(':');
    if (!userId || !email || !campaignName) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', message: 'Invalid decoded token values' });
    }

    console.log('Decoded Token ->', { userId, email, campaignName });
    console.log('Payload ->', payload);

    const result = await this.googleAdsService.handleWebhook(payload, userId, email, campaignName);

    console.log('Webhook Result ->', result);

    return res.status(HttpStatus.OK).json({
      status: 'success',
      data: result,
    });
  } catch (err: any) {
    console.error('Webhook Error:', err);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: err.message,
    });
  }
}

}
