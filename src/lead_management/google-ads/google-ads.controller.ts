import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GoogleAdsService } from './google-ads.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Constants } from '../../common/constants';

@Controller({ path: 'google-ads', version: Constants.API_VERSION })
export class GoogleAdsController {
  constructor(private readonly googleAdsService: GoogleAdsService) {}

  @Post('webhook/test')
  async testWebhook(@Body() payload: any, @Headers('x-webhook-key') key: string) {
    const expectedKey = 'supersecret123';
    const webhookKey = key || payload.google_key;

    if (!webhookKey || webhookKey !== expectedKey) {
      throw new HttpException('Invalid webhook key', HttpStatus.FORBIDDEN);
    }

    const userId = 'test-user-2';
    const email = 'srikanth@digiwebspot.com';

    try {
      await this.googleAdsService.handleWebhook(payload, userId, email);
      return { status: 'success' };
    } catch (error: any) {
      console.error('Error processing test webhook:', error.message);
      throw new HttpException('Failed to process webhook', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  @UseGuards(JwtAuthGuard)
  @Post('webhook')
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-webhook-key') xWebhookKey: string,
    @Headers('X-Webhook-Key') XWebhookKey: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub;
    const email = req.user?.email;

    if (!userId || !email) {
      throw new HttpException('Invalid user context', HttpStatus.UNAUTHORIZED);
    }

    const webhookKey = xWebhookKey || XWebhookKey || payload.google_key;
    const expectedKey = process.env.GOOGLE_ADS_WEBHOOK_KEY || 'supersecret123';

    if (!webhookKey || webhookKey !== expectedKey) {
      throw new HttpException('Invalid webhook key', HttpStatus.FORBIDDEN);
    }

    try {
      const result = await this.googleAdsService.handleWebhook(payload, userId, email);
      return { status: 'success', message: 'Lead stored', data: result };
    } catch (error: any) {
      console.error('Error processing Google Ads webhook:', error.message);
      throw new HttpException(
        `Failed to process webhook: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
