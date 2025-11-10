// src/lead_management/facebook/facebook.controller.ts
import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { FacebookService } from './facebook.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Constants } from '../../common/constants';

@Controller({ path: 'facebook', version: Constants.API_VERSION })
export class FacebookController {
  constructor(private readonly facebookService: FacebookService) {}

  @UseGuards(JwtAuthGuard)
  @Post('webhook')
  async webhook(@Body() payload: any, @Req() req: any) {
    const userId = req.user.sub;
    const email = req.user.email;

    return this.facebookService.handleWebhook(payload, userId, email);
  }
}