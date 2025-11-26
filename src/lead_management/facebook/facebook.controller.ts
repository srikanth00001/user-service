import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Query,
  Res,
  Delete,
  Param,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { FacebookService } from './facebook.service';
import { FacebookPageService } from './facebook-page.service';
import { Constants } from '../../common/constants';

class OAuthCallbackDto {
  code: string;
  userId: string;
}

class SavePageDto {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
}

@Controller({ path: 'facebook', version: Constants.API_VERSION })
export class FacebookController {
  constructor(
    private readonly facebookService: FacebookService,
    private readonly facebookPageService: FacebookPageService,
  ) {}

  @Post('oauth-callback')
  async oauthCallback(@Body() body: OAuthCallbackDto, @Req() req: any) {
    if (!body.code || !body.userId) throw new Error('Missing code or userId');
    const tenantKey = req.user?.tenantKey;
    return this.facebookService.handleOAuthCallback(body.code, body.userId, tenantKey);
  }

  @Get('oauth-callback')
async oauthCallbackGet(
  @Query('code') code: string,
  @Query('state') state: string,
  @Res() res: Response,
) {
  if (!code || !state) return res.status(400).send('Missing code or state');

  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(state));
  } catch {
    return res.status(400).send('Invalid state');
  }

  const { userId, tenantKey } = payload;
  await this.facebookService.handleOAuthCallback(code, userId, tenantKey);

  res.redirect('http://localhost:3003/meta-leads'); // your frontend dashboard
}


  @UseGuards(JwtAuthGuard)
  @Post('save-page')
  async savePage(@Req() req: any, @Body() body: SavePageDto) {
    const userId = req.user.userId;
    const tenantKey = req.user.tenantKey;
    try {
      const saved = await this.facebookPageService.saveConnectedPage({
        tenantKey,
        userId,
        pageId: body.pageId,
        pageName: body.pageName,
        accessToken: body.pageAccessToken,
      });
      return { success: true, data: saved };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @UseGuards(JwtAuthGuard)
@Get('page')
async getConnectedPages(@Req() req: any) {
  const userId = req.user.userId;
  const tenantKey = req.user.tenantKey;
  const pages = await this.facebookPageService.getConnectedPages(userId, tenantKey);
  return { success: true, data: pages }; // Now returns array
}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && verifyToken === 'sk123') return challenge;
    return 'Invalid verify token';
  }

  @UseGuards(JwtAuthGuard)
@Delete('page/:pageId')
async disconnectPage(@Param('pageId') pageId: string, @Req() req: any) {
  const tenantKey = req.user.tenantKey;
  await this.facebookPageService.disconnectPage(pageId, tenantKey);
  return { success: true };
}

  @Post('webhook')
  async webhook(@Body() payload: any) {
    return this.facebookService.handleWebhook(payload);
  }
}
