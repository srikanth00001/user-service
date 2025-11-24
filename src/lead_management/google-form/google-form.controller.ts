import { Controller, Post, Body, Param } from '@nestjs/common';
import { GoogleFormService } from './google-form.service';
import { Constants } from '../../common/constants';

@Controller({ path: 'google-form', version: Constants.API_VERSION })
export class GoogleFormController {
  constructor(private readonly googleFormService: GoogleFormService) {}

  @Post('webhook/:publisher')
  async handleWebhook(
    @Body() payload: any,
    @Param('publisher') publisherEmail: string,
  ) {
    if (!publisherEmail) {
      throw new Error('Publisher email missing in webhook URL');
    }

    return this.googleFormService.handleWebhook(payload, publisherEmail);
  }
}
