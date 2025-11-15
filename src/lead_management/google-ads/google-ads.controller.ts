import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  UseGuards,
  Res,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { GoogleAdsService } from './google-ads.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Constants } from '../../common/constants';

@Controller({ path: 'google-ads', version: Constants.API_VERSION })
export class GoogleAdsController {
  constructor(private readonly googleAdsService: GoogleAdsService) {}

  /**
   * Test webhook — uses hardcoded user for DB integration
   */
  @Post('webhook/test')
  async testWebhook(
    @Body() payload: any,
    @Headers('x-webhook-key') key: string,
    @Res() res: Response
  ) {
    const expectedKey = 'supersecret123';
    const webhookKey = key || payload.google_key;

    if (!webhookKey || webhookKey !== expectedKey) {
      console.log('Invalid webhook key', webhookKey);
      return res.status(HttpStatus.OK).json({
        status: 'error',
        message: 'Invalid webhook key',
      });
    }

    const userId = 'test-user-2';
    const email = 'srikanth@digiwebspot.com';

    try {
      await this.googleAdsService.handleWebhook(payload, userId, email);

      return res.status(HttpStatus.OK).json({
        status: 'success',
        gclid: payload.gcl_id || 'test-gclid',
      });
    } catch (error: any) {
      console.error('Error processing test webhook:', error.message);
      return res.status(HttpStatus.OK).json({
        status: 'error',
        message: error.message || 'Failed to process webhook',
      });
    }
  }

  /**
   * Real webhook — saves lead to DB using JWT user
   */
  @UseGuards(JwtAuthGuard)
  @Post('webhook')
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-webhook-key') xWebhookKey: string,
    @Headers('X-Webhook-Key') XWebhookKey: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    const userId = req.user?.sub;
    const email = req.user?.email;

    if (!userId || !email) {
      console.error('Invalid user context');
      return res.status(HttpStatus.OK).json({
        status: 'error',
        message: 'Invalid user context',
      });
    }

    const webhookKey = xWebhookKey || XWebhookKey || payload.google_key;
    const expectedKey = process.env.GOOGLE_ADS_WEBHOOK_KEY || 'supersecret123';

    if (!webhookKey || webhookKey !== expectedKey) {
      console.error('Invalid webhook key', webhookKey);
      return res.status(HttpStatus.OK).json({
        status: 'error',
        message: 'Invalid webhook key',
      });
    }

    try {
      const result = await this.googleAdsService.handleWebhook(payload, userId, email);

      return res.status(HttpStatus.OK).json({
        status: 'success',
        message: 'Lead stored',
        data: result,
      });
    } catch (error: any) {
      console.error('Error saving lead to DB:', error.message);

      return res.status(HttpStatus.OK).json({
        status: 'error',
        message: error.message || 'Failed to save lead',
      });
    }
  }
}
