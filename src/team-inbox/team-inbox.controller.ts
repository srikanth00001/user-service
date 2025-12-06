// src/team-inbox/team-inbox.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { TeamInboxService } from './team-inbox.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Constants } from 'src/common/constants';
import { CreateMessageDto } from 'src/message/dto/create-message.dto';
import { AgentAssignmentService } from 'src/agent-assignment/agent-assignment.service';
import { CreateAgentAssignmentDto } from 'src/agent-assignment/dto/create-agent-assignment.dto';

@UseGuards(JwtAuthGuard)
@Controller({ path: 'team-inbox', version: Constants.API_VERSION })
export class TeamInboxController {
  constructor(
    private readonly teamInboxService: TeamInboxService,
    private readonly AgentAssignmentService: AgentAssignmentService, // ← NEW
  ) { }

  @Get('conversations')
  async getConversations(@Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.teamInboxService.getConversations(tenantKey, userId, email);
  }

  @Get('messages/:conversationId')
  async getMessages(@Param('conversationId', ParseIntPipe) conversationId: number, @Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.teamInboxService.getMessages(tenantKey, conversationId, userId, email);
  }

  // NEW: Assign agent to LEAD (not conversation)
  @Post('assign-lead')
  async assignLead(@Body() dto: CreateAgentAssignmentDto, @Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.AgentAssignmentService.create(tenantKey, dto, userId, email);
  }

  @Get('analytics')
  async getAnalytics(@Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.teamInboxService.getAnalytics(tenantKey, userId, email);
  }

  @Post('send')
  async send(@Body() dto: CreateMessageDto, @Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.teamInboxService.send(tenantKey, dto, userId, email);
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