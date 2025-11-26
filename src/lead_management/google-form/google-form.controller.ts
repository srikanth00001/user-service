import {
  Controller,
  Post,
  Body,
  Param,
  Res,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { GoogleFormService } from './google-form.service';
import { DatabaseManager } from '../../common/database/database.manager';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { ILike } from 'typeorm';
import * as crypto from 'crypto';

@Controller({ path: 'google-form', version: '1' })
export class GoogleFormController {
  constructor(
    private readonly googleFormService: GoogleFormService,
    private readonly dbManager: DatabaseManager,
  ) {}

  @Post('webhook/:token')
  async handleWebhook(
    @Param('token') token: string,
    @Body() payload: any,
    @Res() res: Response,
  ) {
    try {
      if (!token) {
        return res.status(400).json({ status: 'error', message: 'Missing token' });
      }

      // Decode Base64URL token
      let decoded: string;
      try {
        decoded = Buffer.from(token, 'base64url').toString('utf8');
      } catch {
        return res.status(400).json({ status: 'error', message: 'Invalid token format' });
      }

      const parts = decoded.split(':');
      if (parts.length !== 3) {
        return res.status(400).json({ status: 'error', message: 'Invalid token structure' });
      }

      const [userId, email, campaignNameRaw] = parts;
      const campaignName = campaignNameRaw.trim();

      if (!userId || !email || !campaignName) {
        return res.status(400).json({ status: 'error', message: 'Missing token fields' });
      }

      console.log('Webhook From Google Form →', { userId, email, campaignName });

      // Fetch tenant db
      const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
      const campaignRepo = dataSource.getRepository(Campaign);

      // Find or create (case-insensitive)
      let campaign = await campaignRepo.findOne({
        where: { name: ILike(campaignName), createdBy: userId },
      });

      if (!campaign) {
        console.log(`Creating new campaign "${campaignName}"`);
        campaign = await campaignRepo.save(
          campaignRepo.create({
            name: campaignName,
            createdBy: userId,
            active: true,
            secretKey: crypto.randomUUID(),
          })
        );
      }

      // Process the lead
      const result = await this.googleFormService.handleWebhook(
        payload,
        userId,
        email,
        campaignName,
      );

      return res.status(200).json({ status: 'success', data: result });

    } catch (err: any) {
      console.error('Google Form Webhook Error:', err);
      return res.status(500).json({
        status: 'error',
        message: err.message || 'Failed to process webhook',
      });
    }
  }
}
