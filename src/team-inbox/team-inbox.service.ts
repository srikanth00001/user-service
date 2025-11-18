import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
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
import axios from 'axios';
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
  // INCOMING MESSAGE FROM WHATSAPP (WEBHOOK)
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

    // Prevent duplicate messages
    if (data.whatsappMessageId) {
      const exists = await msgRepo.findOne({ where: { whatsapp_message_id: data.whatsappMessageId } });
      if (exists) {
        this.messageGateway.emitNewMessage(exists as any, exists.conversation_id);
        return { success: true, data: exists };
      }
    }

    // Handle reactions
    if (data.reaction) {
      const msg = await msgRepo.findOne({ where: { whatsapp_message_id: data.reaction.messageId } });
      if (msg) {
        await msgRepo.update(msg.id, { reaction: data.reaction.emoji });
        this.messageGateway.emitMessageReacted(msg.id, data.reaction.emoji, msg.conversation_id);
        return { success: true };
      }
    }

    // Find or create lead & conversation
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

    // Update agent assignment if changed
    const assignment = await this.agentAssignmentService.findByLead(data.tenantKey, lead.id, leadSource);
    if (assignment && conv.assigned_agent_id !== assignment.assigned_agent_id) {
      await dataSource.getRepository(Conversation).update(conv.id, {
        assigned_agent_id: assignment.assigned_agent_id,
      });
    }

    // Create message
    const msgDto: CreateMessageDto = {
      conversation_id: conv.id,
      content: data.messageContent,
      type: data.messageType as any,
      parent_message_id: data.parentMessageId,
    };

    const msg = await this.messageService.create(
      data.tenantKey,
      msgDto,
      'system',
      'system',
      data.whatsappMessageId,
    );

    return { success: true, data: msg };
  }

  // ========================================================================
  // GET ALL CONVERSATIONS
  // ========================================================================
  async getConversations(tenantKey: string, userId: string, email: string) {
    const user = await this.businessUserService.findById(tenantKey, userId);
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
    const convResult = await this.conversationService.findOne(tenantKey, dto.conversation_id, userId, email);
    const conv = convResult.data;
    if (!conv) throw new NotFoundException('Conversation not found');

    const user = await this.businessUserService.findById(tenantKey, userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.role.name !== 'business' && conv.assigned_agent_id !== userId) {
      throw new BadRequestException('Not authorized');
    }

    dto.sender_user_id = userId;
    let whatsappMessageId: string | undefined;

    try {
      // Text message
      if (dto.type?.toLowerCase() === 'text' && dto.content?.trim()) {
        const resp = dto.parent_message_id
          ? await this.whatsAppService.sendReplyMessage(
              conv.phone_number,
              dto.content,
              (await this.messageService.findOne(tenantKey, dto.parent_message_id, userId, email)).data.whatsapp_message_id
            )
          : await this.whatsAppService.sendTextMessage(conv.phone_number, dto.content);

        whatsappMessageId = resp?.messageId;
      }
      // Media message
      else if (['image', 'video', 'document', 'audio'].includes(dto.type!) && dto.media_url) {
        const mediaType = dto.type as 'image' | 'video' | 'document' | 'audio';
        const response = await axios.get(dto.media_url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        const mediaId = await this.whatsAppService.uploadMediaBuffer(buffer, dto.filename || 'file', mediaType);

        const payload: any = {
          messaging_product: 'whatsapp',
          to: conv.phone_number.startsWith('+') ? conv.phone_number : `+${conv.phone_number}`,
          type: mediaType,
        };
        if (mediaType === 'document') payload.document = { id: mediaId, filename: dto.filename || 'file', caption: dto.content };
        else payload[mediaType] = { id: mediaId, caption: dto.content };

        if (dto.parent_message_id) {
          const parent = (await this.messageService.findOne(tenantKey, dto.parent_message_id, userId, email)).data;
          if (parent.whatsapp_message_id) payload.context = { message_id: parent.whatsapp_message_id };
        }

        const waResp = await axios.post(
          `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          payload,
          { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
        );

        whatsappMessageId = waResp.data.messages?.[0]?.id;
      }

      const savedMessage = await this.messageService.create(tenantKey, dto, userId, email, whatsappMessageId);
      return savedMessage;
    } catch (err: any) {
      console.error('Failed to send WhatsApp message:', err.response?.data || err.message);
      throw new HttpException(err.message || 'Failed to send message', HttpStatus.BAD_REQUEST);
    }
  }

  // ========================================================================
  // ANALYTICS
  // ========================================================================
  async getAnalytics(tenantKey: string, userId: string, email: string) {
    const user = await this.businessUserService.findById(tenantKey, userId);
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
