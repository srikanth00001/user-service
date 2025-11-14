// src/team-inbox/team-inbox.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseManager } from 'src/common/database/database.manager';
import { ConversationService } from 'src/conversation/conversation.service';
import { MessageService } from 'src/message/message.service';
import { BusinessUserService } from 'src/business-user/business-user.service';
import { LeadsService } from 'src/lead_management/leads/leads.service';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import { MessageGateway } from 'src/websocket/message.gateway';
import { CreateConversationDto } from 'src/conversation/dto/create-conversation.dto';
import { CreateMessageDto } from 'src/message/dto/create-message.dto';
import { DataSource } from 'typeorm';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { AgentAssignmentService } from 'src/agent-assignment/agent-assignment.service';

@Injectable()
export class TeamInboxService {
  constructor(
    private dbManager: DatabaseManager,
    private conversationService: ConversationService,
    private messageService: MessageService,
    private businessUserService: BusinessUserService,
    private leadsService: LeadsService,
    private whatsAppService: WhatsAppService,
    private messageGateway: MessageGateway,
    private AgentAssignmentService: AgentAssignmentService, // ← NEW
  ) {}

  private async getRepos(dataSource: DataSource) {
    return {
      conversation: dataSource.getRepository(Conversation),
      message: dataSource.getRepository('Message'),
    };
  }

  async processIncomingMessage(data: {
    tenantKey: string;
    phoneNumber: string;
    name: string | null;
    messageContent: string;
    messageType: string;
    whatsappMessageId?: string;
    parentMessageId?: number;
    reaction?: { messageId: number; emoji: string };
  }) {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(data.tenantKey);
    const { message: msgRepo } = await this.getRepos(dataSource);

    // === Handle Reaction ===
    if (data.reaction) {
      const msg = await msgRepo.findOne({ where: { whatsapp_message_id: data.reaction.messageId.toString() } });
      if (!msg) throw new NotFoundException('Message not found for reaction');
      await msgRepo.update(msg.id, { reaction: data.reaction.emoji });
      this.messageGateway.emitMessageReacted(msg.id, data.reaction.emoji, msg.conversation_id);
      return { success: true, data: { messageId: msg.id, reaction: data.reaction.emoji } };
    }

    // === Find Lead ===
    const lead = await this.leadsService.findLeadByPhone(data.tenantKey, data.phoneNumber);
    if (!lead) throw new NotFoundException('Lead not found');

    // === Find or Create Conversation ===
    let conv = await this.conversationService.findByLead(data.tenantKey, lead.id, lead.source ?? 'manual');
    if (!conv) {
      const dto: CreateConversationDto = {
        lead_id: lead.id,
        source: lead.source,
        phone_number: data.phoneNumber,
        lead_name: data.name || lead.name,
      };
      conv = (await this.conversationService.create(data.tenantKey, dto, 'system', 'system')).data;
    }

    // === Auto-sync assignment from LeadAssignment ===
    const leadAssignment = await this.AgentAssignmentService.findByLead(data.tenantKey, lead.id);
    if (leadAssignment && conv.assigned_agent_id !== leadAssignment.assigned_agent_id) {
      await dataSource.getRepository(Conversation).update(conv.id, {
        assigned_agent_id: leadAssignment.assigned_agent_id,
      });
      conv.assigned_agent_id = leadAssignment.assigned_agent_id;
    }

    // === Create Message ===
    const msgDto: CreateMessageDto = {
      conversation_id: conv.id,
      content: data.messageContent,
      type: data.messageType as any,
      parent_message_id: data.parentMessageId,
    };
    const msg = await this.messageService.create(data.tenantKey, msgDto, 'system', 'system', data.whatsappMessageId);

    // === Emit via WebSocket ===
    this.messageGateway.emitNewMessage(msg.data, conv.id);

    return { success: true, data: msg };
  }

  async getConversations(tenantKey: string, userId: string, email: string) {
    const user = await this.businessUserService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return await this.conversationService.findAll(tenantKey, userId, email);
  }

  async getMessages(tenantKey: string, conversationId: number, userId: string, email: string) {
    return await this.messageService.findByConversation(tenantKey, conversationId, userId, email);
  }

  async send(tenantKey: string, dto: CreateMessageDto, userId: string, email: string) {
    const conv = (await this.conversationService.findOne(tenantKey, dto.conversation_id, userId, email)).data;
    if (!conv) throw new NotFoundException('Conversation not found');

    const user = await this.businessUserService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Authorization: only business or assigned agent
    if (user.role.name !== 'business' && conv.assigned_agent_id !== userId) {
      throw new BadRequestException('Not authorized to send message in this conversation');
    }

    dto.sender_user_id = userId;

    let whatsappId: string | undefined = undefined;
    if (dto.type === 'text') {
      if (dto.parent_message_id) {
        const parent = (await this.messageService.findOne(tenantKey, dto.parent_message_id, userId, email)).data;
        whatsappId = (await this.whatsAppService.sendReplyMessage(conv.phone_number, dto.content!, parent.whatsapp_message_id!)).messageId;
      } else {
        whatsappId = (await this.whatsAppService.sendTextMessage(conv.phone_number, dto.content!)).messageId;
      }
    }

    const msg = await this.messageService.create(tenantKey, dto, userId, email, whatsappId);
    this.messageGateway.emitNewMessage(msg.data, dto.conversation_id);

    return msg;
  }

  async getAnalytics(tenantKey: string, userId: string, email: string) {
    const user = await this.businessUserService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role.name !== 'business') throw new BadRequestException('Only business can access analytics');

    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const { conversation: convRepo, message: msgRepo } = await this.getRepos(dataSource);

    const total = await convRepo.count();
    const open = await convRepo.count({ where: { status: 'open' } });
    const closed = await convRepo.count({ where: { status: 'closed' } });
    const pending = await convRepo.count({ where: { status: 'pending' } });

    const convs = await convRepo.find();
    let totalResponseTime = 0;
    let responded = 0;

    for (const conv of convs) {
      const msgs = await msgRepo.find({ where: { conversation_id: conv.id } });
      const customerMsgs = msgs.filter((m) => !m.sender_user_id);
      const agentMsgs = msgs.filter((m) => m.sender_user_id);

      if (customerMsgs.length > 0 && agentMsgs.length > 0) {
        const firstCustomer = customerMsgs.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())[0];
        const firstAgent = agentMsgs.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())[0];
        totalResponseTime += firstAgent.created_at.getTime() - firstCustomer.created_at.getTime();
        responded++;
      }
    }

    const avgResponse = responded > 0 
      ? (totalResponseTime / responded / 1000 / 60).toFixed(2) + ' minutes' 
      : '0 minutes';

    return { success: true, data: { total, open, closed, pending, avgResponse } };
  }
}