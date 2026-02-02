// src/message/message.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  Request,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
  Put,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Constants } from 'src/common/constants';
import { FileInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard)
@Controller({ path: 'messages', version: Constants.API_VERSION })
export class MessageController {
  constructor(private readonly messageService: MessageService) { }

  @Get('template-responses')
  async getTemplateResponses(@Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.getTemplateResponses(tenantKey, userId, email);
  }

  @Post()
  async create(@Body() dto: CreateMessageDto, @Request() req: any) {
    console.log('=== MESSAGE CONTROLLER DEBUG ===');
    console.log('req.user keys:', Object.keys(req.user || {}));
    console.log('req.user full:', JSON.stringify(req.user, null, 2));
    const { userId, email, tenantKey } = this.getUser(req);
    console.log('Extracted userId:', userId);

    // Explicitly set sender_user_id if not present in DTO
    if (!dto.sender_user_id && userId) {
      dto.sender_user_id = userId;
    }
    console.log('DTO sender_user_id:', dto.sender_user_id);

    try {
      const result = await this.messageService.create(tenantKey, dto, userId, email);
      return result;
    } catch (err) {
      console.error('ERROR CREATING MESSAGE:', err);
      throw err;
    }
  }



  @Get(':conversationId')
  async findByConversation(@Param('conversationId', ParseIntPipe) conversationId: number, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.findByConversation(tenantKey, conversationId, userId, email);
  }

  @Put(':conversationId/read')
  async markRead(@Param('conversationId', ParseIntPipe) conversationId: number, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.markRead(tenantKey, conversationId, userId, email);
  }

  @Get('filter/label/:label')
  async filterByLabel(@Param('label') label: string, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.filterByLabel(tenantKey, label, userId, email);
  }

  @Get('unique-labels/:conversationId')
  async getUniqueLabels(@Param('conversationId', ParseIntPipe) conversationId: number, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.getUniqueLabels(tenantKey, conversationId, userId, email);
  }

  @Put(':messageId/label/add')
  async addLabel(@Param('messageId', ParseIntPipe) messageId: number, @Body('label') label: string, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.addLabel(tenantKey, messageId, label, userId, email);
  }

  @Put(':messageId/label/remove')
  async removeLabel(@Param('messageId', ParseIntPipe) messageId: number, @Body('label') label: string, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.removeLabel(tenantKey, messageId, label, userId, email);
  }

  @Post(':messageId/forward')
  async forward(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body('target_conversation_id') targetConversationId: number, // ← change this
    @Request() req: any,
  ) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.forward(tenantKey, [messageId], targetConversationId, userId, email);
  }

  @Post(':messageId/share')
  async share(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body('targetConversationId', ParseIntPipe) targetId: number,
    @Body() body: { type?: string; media_url?: string; filename?: string },
    @Request() req: any,
  ) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.share(tenantKey, messageId, targetId, userId, email, body.type, body.media_url, body.filename);
  }

  @Put(':messageId/delete/me')
  async deleteForMe(@Param('messageId', ParseIntPipe) messageId: number, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.deleteForMe(tenantKey, messageId, userId, email);
  }

  @Put(':messageId/delete/everyone')
  async deleteForEveryone(@Param('messageId', ParseIntPipe) messageId: number, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.deleteForEveryone(tenantKey, messageId, userId, email);
  }

  @Put(':messageId/react')
  async react(@Param('messageId', ParseIntPipe) messageId: number, @Body('reaction') reaction: string, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.react(tenantKey, messageId, reaction, userId, email);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { messageId: number; view_once?: string },
    @Request() req: any,
  ) {
    const { userId, email, tenantKey } = this.getUser(req);
    const viewOnce = body.view_once === 'true';
    if (!file) throw new HttpException('File missing', HttpStatus.BAD_REQUEST);
    return this.messageService.upload(tenantKey, body.messageId, file, userId, email, viewOnce);
  }

  @Post('upload-only')
  @UseInterceptors(FileInterceptor('file'))
  async uploadOnly(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    const { userId, email, tenantKey } = this.getUser(req);
    if (!file) throw new HttpException('File missing', HttpStatus.BAD_REQUEST);
    return this.messageService.uploadMediaOnly(tenantKey, file, userId, email);
  }

  private getUser(req: any) {
    return {
      userId: req.user?.userId || req.user?.sub || req.user?.id,
      email: req.user?.email,
      tenantKey: req.user?.tenantKey,
      role: req.user?.role,
    };
  }

}