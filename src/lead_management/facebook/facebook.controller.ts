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
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { FacebookService } from './facebook.service';
import { FacebookPageService } from './facebook-page.service';
import { Constants } from '../../common/constants';
import { MetaConnection } from './entities/meta-connection.entity';

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

  @Post('app-config')
@UseGuards(JwtAuthGuard)
async saveMetaAppConfig(@Req() req: any, @Body() body: {
  appId: string;
  appSecret: string;
  redirectUri: string;
}) {
  const tenantKey = req.user.tenantKey;
  return this.facebookService.saveMetaAppConfig(tenantKey, body);
}

@Get('app-config')
@UseGuards(JwtAuthGuard)
async getMetaAppConfig(@Req() req: any) {
  const tenantKey = req.user.tenantKey;
  return this.facebookService.getMetaAppConfig(tenantKey);
}

  @Get('oauth-callback')
async oauthCallbackGet(
  @Query('code') code: string,
  @Query('state') state: string,
  @Res() res: Response,
) {
  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(state));
  } catch {
    return res.status(400).send('Invalid state');
  }

  // THIS IS THE KEY FIX
  if (payload.flow === 'whatsapp') {
    // WhatsApp flow → pass code & state to frontend
    const frontendUrl = `http://localhost:3003/meta-leads?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    console.log('WhatsApp flow → redirecting to frontend with params');
    return res.redirect(frontendUrl);
  }

  // Default = Pages flow → handle on backend (old working way)
  console.log('Pages flow → handling on backend');
  const { userId, tenantKey } = payload;
  await this.facebookService.handleOAuthCallback(code, userId, tenantKey);

  // Clean redirect (no params)
  return res.redirect('http://localhost:3003/meta-leads');
}

@Post('whatsapp-oauth-callback')
async whatsappOAuthCallback(@Body() body: { code: string; userId: string; tenantKey: string }) {
  const { code, userId, tenantKey } = body;

  if (!code || !userId || !tenantKey) {
    throw new Error('Missing code, userId or tenantKey');
  }

  // Now we have everything we need from the frontend via state → no need for req.user
  return this.facebookService.handleWhatsAppOAuthCallback(code, userId, tenantKey);
}

 @Post('connect-whatsapp')
async connectWhatsAppNumber(
  @Body()
  body: {
    phoneNumberId: string;
    displayPhoneNumber: string;
    wabaId: string;
    pageId: string;
    pageName: string;
    tenantKey: string;   // ← ADD THIS
    userId: string;      // ← ADD THIS
  },
  @Req() req: any,
) {
  // Now TypeScript knows these fields exist
  const tenantKey = body.tenantKey || req.user?.tenantKey;
  const userId = body.userId || req.user?.userId;

  if (!tenantKey) throw new BadRequestException('tenantKey is required');
  if (!userId) throw new BadRequestException('userId is required');

  const connection = await this.facebookService.saveWhatsAppConnection(
    tenantKey,
    userId,
    {
      phoneNumberId: body.phoneNumberId,
      displayPhoneNumber: body.displayPhoneNumber,
      wabaId: body.wabaId,
      pageId: body.pageId,
      pageName: body.pageName,
    },
  );

  return {
    success: true,
    message: 'WhatsApp number connected successfully!',
    data: connection,
  };
}

  @Get('whatsapp-connections')
@UseGuards(JwtAuthGuard)
async getWhatsAppConnections(@Req() req: any) {
  const tenantKey = req.user.tenantKey;

  // Use dbManager from service (already injected)
  const dataSource = await this.facebookService['dbManager'].getOrCreateTenantConnection(tenantKey);
  const repo = dataSource.getRepository(MetaConnection);

  const connections = await repo.find({
    where: { tenantKey, active: true },
    order: { connectedAt: 'DESC' },
  });

  return { success: true, data: connections };
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
