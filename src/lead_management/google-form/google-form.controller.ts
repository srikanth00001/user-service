// src/lead_management/google-form/google-form.controller.ts
import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GoogleFormService } from './google-form.service';
import { Constants } from '../../common/constants';

@Controller({ path: 'webhook/google-form', version: Constants.API_VERSION })
export class GoogleFormController {
  constructor(private readonly googleFormService: GoogleFormService) {}

  @Post()
  async handle(
    @Body() payload: any,
    @Headers('x-webhook-key') webhookKey: string,
    @Headers('x-publisher-email') publisherEmail: string,
  ) {
    // ── Secret key validation ─────────────────────────────────────
    if (webhookKey !== 'your-super-secret-key-12345') {
      throw new HttpException('Invalid webhook key', HttpStatus.FORBIDDEN);
    }

    // ── Publisher e-mail is required ─────────────────────────────
    if (!publisherEmail) {
      throw new HttpException(
        'Header x-publisher-email is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // ── Call service with BOTH arguments ────────────────────────
    return this.googleFormService.handleWebhook(payload, publisherEmail);
  }
}