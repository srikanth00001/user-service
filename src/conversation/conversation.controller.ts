// src/conversation/conversation.controller.ts
import { Controller, Get, Post, Body, Param, Patch, Delete, Request, UseGuards, ParseIntPipe, Query, Req } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Constants } from 'src/common/constants';

@UseGuards(JwtAuthGuard)
@Controller({ path: 'conversations', version: Constants.API_VERSION })
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  async create(@Body() createConversationDto: CreateConversationDto, @Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.conversationService.create(tenantKey, createConversationDto, userId, email);
  }

  @Get()
  async findAll(@Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.conversationService.findAll(tenantKey, userId, email);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.conversationService.findOne(tenantKey, id, userId, email);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateConversationDto: UpdateConversationDto,
    @Req() req: any,
  ) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.conversationService.update(tenantKey, id, updateConversationDto, userId, email);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.conversationService.remove(tenantKey, id, userId, email);
  }

  @Get('my-conversations')
  async findMyConversations(@Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.conversationService.findByAssignedAgent(tenantKey, userId, email);
  }

  @Get('filter/:status')
  async filterByStatus(@Param('status') status: string, @Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.conversationService.filterByStatus(
  tenantKey,
  status as 'open' | 'closed' | 'pending',
  userId,
  email,
);
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.conversationService.getUnreadCount(tenantKey, userId, email);
  }

  @Get('search')
  async search(@Query('query') query: string, @Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.conversationService.search(tenantKey, query, userId, email);
  }

  @Get('filter/advanced')
  async advancedFilter(
    @Query() filters: { priority?: string; department?: string; topic?: string; channel?: string; sentiment?: string },
    @Req() req: any,
  ) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.conversationService.advancedFilter(tenantKey, filters, userId, email);
  }

  private getUser(req: any) {
    return {
      userId: req.user?.sub || req.user?.id,
      email: req.user?.email,
      tenantKey: req.user?.tenantKey,
      role: req.user?.role,
    };
  }
}