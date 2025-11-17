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
    private agentAssignmentService: AgentAssignmentService,
  ) {}

  private async getRepos(dataSource: DataSource) {
    return {
      conversation: dataSource.getRepository(Conversation),
      message: dataSource.getRepository('Message'),
    };
  }

  // ========================================================================
  // INCOMING MESSAGE FROM WHATSAPP (via webhook)
  // ========================================================================
  async processIncomingMessage(data: {
    tenantKey: string;
    phoneNumber: string;
    name: string | null;
    messageContent: string;
    messageType: string;
    whatsappMessageId?: string;
    parentMessageId?: number;
    reaction?: { messageId: string; emoji: string };
  }) {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(data.tenantKey);
    const { message: msgRepo } = await this.getRepos(dataSource);

    // === PREVENT DUPLICATES ===
    if (data.whatsappMessageId) {
      const exists = await msgRepo.findOne({ where: { whatsapp_message_id: data.whatsappMessageId } });
      if (exists) {
        // Still emit to keep UI in sync (e.g., if user reloaded)
        this.messageGateway.emitNewMessage(exists as any, exists.conversation_id);
        return { success: true, data: exists };
      }
    }

    // === HANDLE REACTION ===
    if (data.reaction) {
      const msg = await msgRepo.findOne({ where: { whatsapp_message_id: data.reaction.messageId } });
      if (msg) {
        await msgRepo.update(msg.id, { reaction: data.reaction.emoji });
        this.messageGateway.emitMessageReacted(msg.id, data.reaction.emoji, msg.conversation_id);
        return { success: true };
      }
    }

    // === FIND OR CREATE LEAD & CONVERSATION ===
    const lead = await this.leadsService.findLeadByPhone(data.tenantKey, data.phoneNumber);
    if (!lead) throw new NotFoundException('Lead not found');

    const leadSource = lead.source ?? 'manual';
    let conv = await this.conversationService.findByLead(data.tenantKey, lead.id, leadSource);

    if (!conv) {
      const dto: CreateConversationDto = {
        lead_id: lead.id,
        source: leadSource,
        phone_number: data.phoneNumber,
        lead_name: data.name || lead.name,
      };
      conv = (await this.conversationService.create(data.tenantKey, dto, 'system', 'system')).data;
    }

    // === UPDATE ASSIGNMENT IF CHANGED ===
    const assignment = await this.agentAssignmentService.findByLead(data.tenantKey, lead.id, leadSource);
    if (assignment && conv.assigned_agent_id !== assignment.assigned_agent_id) {
      await dataSource.getRepository(Conversation).update(conv.id, {
        assigned_agent_id: assignment.assigned_agent_id,
      });
    }

    // === CREATE MESSAGE (Let MessageService emit via event) ===
    const msgDto: CreateMessageDto = {
      conversation_id: conv.id,
      content: data.messageContent,
      type: data.messageType as any,
      parent_message_id: data.parentMessageId,
    };

    const msg = await this.messageService.create(
      data.tenantKey,
      msgDto,
      'system', // userId
      'system', // email
      data.whatsappMessageId,
    );

    // DO NOT emit manually — MessageService already emits 'message.created'
    // this.messageGateway.emitNewMessage(...) ← REMOVED

    return { success: true, data: msg };
  }

  // ========================================================================
  // GET ALL CONVERSATIONS
  // ========================================================================
  async getConversations(tenantKey: string, userId: string, email: string) {
    const user = await this.businessUserService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return await this.conversationService.findAll(tenantKey, userId, email);
  }

  // ========================================================================
  // GET MESSAGES IN CONVERSATION
  // ========================================================================
  async getMessages(tenantKey: string, conversationId: number, userId: string, email: string) {
    return await this.messageService.findByConversation(tenantKey, conversationId, userId, email);
  }

  // ========================================================================
  // SEND MESSAGE FROM AGENT
  // ========================================================================
  async send(tenantKey: string, dto: CreateMessageDto, userId: string, email: string) {
    const conv = (await this.conversationService.findOne(tenantKey, dto.conversation_id, userId, email)).data;
    if (!conv) throw new NotFoundException('Conversation not found');

    const user = await this.businessUserService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Authorization: only business or assigned agent
    if (user.role.name !== 'business' && conv.assigned_agent_id !== userId) {
      throw new BadRequestException('Not authorized to send message in this conversation');
    }

    // Set sender
    dto.sender_user_id = userId;

    let whatsappId: string | undefined = undefined;

    // === SEND TO WHATSAPP ===
    if (dto.type === 'text') {
      if (dto.parent_message_id) {
        const parent = (await this.messageService.findOne(tenantKey, dto.parent_message_id, userId, email)).data;
        if (!parent.whatsapp_message_id) {
          throw new BadRequestException('Cannot reply to message without WhatsApp ID');
        }
        whatsappId = (await this.whatsAppService.sendReplyMessage(
          conv.phone_number,
          dto.content!,
          parent.whatsapp_message_id,
        )).messageId;
      } else {
        whatsappId = (await this.whatsAppService.sendTextMessage(conv.phone_number, dto.content!)).messageId;
      }
    }

    // === SAVE & LET EVENT EMIT ===
    const msg = await this.messageService.create(tenantKey, dto, userId, email, whatsappId);

    // DO NOT emit manually — MessageService emits 'message.created'
    // this.messageGateway.emitNewMessage(...) ← REMOVED

    return msg;
  }

  // ========================================================================
  // ANALYTICS
  // ========================================================================
  async getAnalytics(tenantKey: string, userId: string, email: string) {
    const user = await this.businessUserService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role.name !== 'business') throw new BadRequestException('Only business can access analytics');

    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const { conversation: convRepo, message: msgRepo } = await this.getRepos(dataSource);

    const [total, open, closed, pending] = await Promise.all([
      convRepo.count(),
      convRepo.count({ where: { status: 'open' } }),
      convRepo.count({ where: { status: 'closed' } }),
      convRepo.count({ where: { status: 'pending' } }),
    ]);

    const convs = await convRepo.find();
    let totalResponseTime = 0;
    let responded = 0;

    for (const conv of convs) {
      const msgs = await msgRepo.find({
        where: { conversation_id: conv.id },
        order: { created_at: 'ASC' },
      });

      const customerMsgs = msgs.filter((m) => !m.sender_user_id);
      const agentMsgs = msgs.filter((m) => m.sender_user_id);

      if (customerMsgs.length > 0 && agentMsgs.length > 0) {
        const firstCustomer = customerMsgs[0];
        const firstAgent = agentMsgs[0];
        totalResponseTime += firstAgent.created_at.getTime() - firstCustomer.created_at.getTime();
        responded++;
      }
    }

    const avgResponse = responded > 0
      ? (totalResponseTime / responded / 1000 / 60).toFixed(2) + ' minutes'
      : '0 minutes';

    return {
      success: true,
      data: { total, open, closed, pending, avgResponse },
    };
  }
}