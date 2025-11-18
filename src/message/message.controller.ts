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
} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Constants } from 'src/common/constants';
import { FileInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard)
@Controller({ path: 'messages', version: Constants.API_VERSION })
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
async create(@Body() dto: CreateMessageDto, @Request() req: any) {
  console.log('REQ.USER:', req.user); // JWT payload
  const { userId, email, tenantKey } = this.getUser(req);
  console.log('RESOLVED USERID:', userId);
  console.log('DTO BEFORE SENDING TO SERVICE:', dto);

  try {
    dto.sender_user_id = userId;
    const result = await this.messageService.create(tenantKey, dto, userId, email);
    console.log('MESSAGE CREATED:', result);
    return result;
  } catch (err) {
    console.error('ERROR CREATING MESSAGE:', err.message, err.stack);
    throw err;
  }
}



  @Get(':conversationId')
  async findByConversation(@Param('conversationId', ParseIntPipe) conversationId: number, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.findByConversation(tenantKey, conversationId, userId, email);
  }

  @Patch(':conversationId/read')
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

  @Patch(':messageId/label/add')
  async addLabel(@Param('messageId', ParseIntPipe) messageId: number, @Body('label') label: string, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.addLabel(tenantKey, messageId, label, userId, email);
  }

  @Patch(':messageId/label/remove')
  async removeLabel(@Param('messageId', ParseIntPipe) messageId: number, @Body('label') label: string, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.removeLabel(tenantKey, messageId, label, userId, email);
  }

  @Post(':messageId/forward')
  async forward(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body('targetConversationIds') targetIds: number[],
    @Request() req: any,
  ) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.forward(tenantKey, [messageId], targetIds[0], userId, email);
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

  @Patch(':messageId/delete/me')
  async deleteForMe(@Param('messageId', ParseIntPipe) messageId: number, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.deleteForMe(tenantKey, messageId, userId, email);
  }

  @Patch(':messageId/delete/everyone')
  async deleteForEveryone(@Param('messageId', ParseIntPipe) messageId: number, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.deleteForEveryone(tenantKey, messageId, userId, email);
  }

  @Patch(':messageId/react')
  async react(@Param('messageId', ParseIntPipe) messageId: number, @Body('reaction') reaction: string, @Request() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.messageService.react(tenantKey, messageId, reaction, userId, email);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { messageId: number; media_type: 'image' | 'video' | 'document' | 'audio' | 'application'; view_once?: string },
    @Request() req: any,
  ) {
    const { userId, email, tenantKey } = this.getUser(req);
    const viewOnce = body.view_once === 'true';
    if (!file) throw new HttpException('File missing', HttpStatus.BAD_REQUEST);
    return this.messageService.upload(tenantKey, body.messageId, file, body.media_type, userId, email, viewOnce);
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