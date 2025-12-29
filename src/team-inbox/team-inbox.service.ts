import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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
import { Lead } from 'src/lead_management/leads/entities/lead.entity';
import { Message } from 'src/message/entities/message.entity';
import { User } from 'src/user/entities/user.entity';
import { MetaConnection } from 'src/lead_management/facebook/entities/meta-connection.entity';

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
  ) { }

  private async getRepos(dataSource: DataSource) {
    return {
      conversation: dataSource.getRepository(Conversation),
      message: dataSource.getRepository(Message),
    };
  }

  /**
   * Normalize phone number for database storage
   * Removes country code (91) to store as 9715574444
   * WhatsApp sends as 919715574444, we normalize to 9715574444
   */
  private normalizePhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, ''); // Remove non-digits
    // If starts with 91 (India country code) and has more than 10 digits, remove it
    if (digits.startsWith('91') && digits.length > 10) {
      return digits.substring(2); // Remove '91' prefix
    }
    return digits;
  }

  async processIncomingMessage(data: {
    tenantKey: string;
    phoneNumber: string;
    name: string | null;
    messageContent: string;
    messageType: string;
    whatsappMessageId?: string;
    parentMessageId?: number;
    reaction?: { messageId: string; emoji: string };
    businessPhoneNumberId?: string;
    mediaUrl?: string;
    filename?: string;
  }) {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(data.tenantKey);
    const { message: msgRepo, conversation: convRepo } = await this.getRepos(dataSource);

    if (data.whatsappMessageId) {
      const exists = await msgRepo.findOne({ where: { whatsapp_message_id: data.whatsappMessageId } });
      if (exists) {
        this.messageGateway.emitNewMessage(exists as any, exists.conversation_id);
        return { success: true, data: exists };
      }
    }

    if (data.reaction) {
      const msg = await msgRepo.findOne({ where: { whatsapp_message_id: data.reaction.messageId } });
      if (msg) {
        await msgRepo.update(msg.id, { reaction: data.reaction.emoji });
        this.messageGateway.emitMessageReacted(msg.id, data.reaction.emoji, msg.conversation_id);
        return { success: true };
      }
    }

    // Normalize phone number for consistent storage (remove country code)
    const normalizedPhone = this.normalizePhoneNumber(data.phoneNumber);

    let lead = await this.leadsService.findLeadByPhone(data.tenantKey, normalizedPhone);
    if (!lead) {
      const repo = dataSource.getRepository(Lead);
      lead = await repo.save(
        repo.create({
          name: data.name || 'Unknown',
          phone: normalizedPhone,
          source: 'manual',
          createdBy: 'system',
        })
      );
    }

    const leadSource = lead.source ?? 'manual';
    // Prefer existing conversation by phone number to avoid source mismatches creating duplicate conversations
    // Use normalized phone number for lookup
    let conv = await convRepo.findOne({ where: { phone_number: normalizedPhone } });
    if (!conv) {
      conv = await this.conversationService.findByLead(data.tenantKey, lead.id, leadSource);
    }

    if (!conv) {
      const dto: CreateConversationDto = {
        lead_id: lead.id,
        source: leadSource,
        phone_number: normalizedPhone,
        lead_name: data.name || lead.name,
        business_phone_number_id: data.businessPhoneNumberId,
        initiated_by: 'customer', // Customer initiated the conversation
      } as any;
      conv = (await this.conversationService.create(data.tenantKey, dto, 'system', 'system')).data;
    }

    const assignment = await this.agentAssignmentService.findByLead(data.tenantKey, lead.id, leadSource);
    if (assignment && conv.assigned_agent_id !== assignment.assigned_agent_id) {
      await dataSource.getRepository(Conversation).update(conv.id, {
        assigned_agent_id: assignment.assigned_agent_id,
      });
      conv.assigned_agent_id = assignment.assigned_agent_id;
    }

    const msgDto: CreateMessageDto = {
      conversation_id: conv.id,
      content: data.messageContent,
      type: data.messageType as any,
      parent_message_id: data.parentMessageId,
      media_url: data.mediaUrl,
      filename: data.filename,
    };

    const msg = await this.messageService.create(
      data.tenantKey,
      msgDto,
      '',
      '',
      data.whatsappMessageId,
    );

    return { success: true, data: msg };
  }

  async getConversations(tenantKey: string, userId: string, email: string) {
    const user = await this.businessUserService.findById(tenantKey, userId);
    if (!user) throw new NotFoundException('User not found');

    return await this.conversationService.findAll(tenantKey, userId, email);
  }

  async getMessages(tenantKey: string, conversationId: number, userId: string, email: string) {
    return await this.messageService.findByConversation(tenantKey, conversationId, userId, email);
  }

  async send(tenantKey: string, dto: CreateMessageDto, userId: string, email: string) {
    const convResult = await this.conversationService.findOne(tenantKey, dto.conversation_id, userId, email);
    const conv = convResult.data;
    if (!conv) throw new NotFoundException('Conversation not found');

    let user: any = await this.businessUserService.findById(tenantKey, userId);

    // Fallback: Check Master DB for Business Owner
    if (!user) {
      const masterDs = this.dbManager.getMasterDataSource();
      const masterUser = await masterDs.getRepository(User).findOne({
        where: { id: userId, tenantKey },
        relations: ['role'],
      });
      if (masterUser) {
        user = masterUser;
      }
    }

    if (!user) throw new NotFoundException('User not found');

    if (user.role.name !== 'business' && conv.assigned_agent_id !== userId) {
      throw new BadRequestException('Not authorized');
    }

    dto.sender_user_id = userId;
    let whatsappMessageId: string | undefined;

    try {
      // Fetch WhatsApp credentials from MetaConnection
      const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
      const metaConnRepo = ds.getRepository(MetaConnection);
      const metaConn = await metaConnRepo.findOne({
        where: { phoneNumberId: conv.business_phone_number_id }
      });

      if (!metaConn) {
        throw new NotFoundException('WhatsApp connection not found for this conversation. Please connect your WhatsApp Business account.');
      }

      const opts = {
        phoneNumberId: metaConn.phoneNumberId,
        accessToken: metaConn.accessToken
      };

      // TEXT MESSAGE
      if (dto.type === 'text' && dto.content?.trim()) {
        if (dto.parent_message_id) {
          const parent = (await this.messageService.findOne(tenantKey, dto.parent_message_id, userId, email)).data;
          whatsappMessageId = await this.whatsAppService.sendReplyMessage(
            conv.phone_number,
            dto.content,
            parent.whatsapp_message_id,
            opts
          );
        } else {
          whatsappMessageId = await this.whatsAppService.sendTextMessage(conv.phone_number, dto.content, opts);
        }
      }

      // MEDIA MESSAGE — ONLY SEND IF media_url EXISTS (i.e. already uploaded)
      else if (['image', 'video', 'document', 'audio'].includes(dto.type!) && dto.media_url) {
        // This case happens when forwarding/sharing already-uploaded media
        // Extract media ID from URL or re-upload if needed
        // For now, skip WhatsApp send — it was already sent during upload
        whatsappMessageId = 'already_sent_via_upload';
      }

      // MEDIA PLACEHOLDER → DO NOT SEND TO WHATSAPP HERE
      // The actual send happens in MessageService.upload() after file is uploaded
      else if (['image', 'video', 'document', 'audio'].includes(dto.type!) && !dto.media_url) {
        // This is a placeholder for file upload → do nothing
        whatsappMessageId = undefined;
      }

      else {
        throw new BadRequestException('Invalid message: missing content or media');
      }

      // Save message (with or without whatsapp_message_id)
      const savedMessage = await this.messageService.create(
        tenantKey,
        dto,
        userId,
        email,
        whatsappMessageId, // may be undefined → OK
      );

      // Only emit if not a placeholder
      if (whatsappMessageId && whatsappMessageId !== 'already_sent_via_upload') {
        this.messageGateway.emitNewMessage(savedMessage.data, dto.conversation_id);
      }

      return savedMessage;
    } catch (err: any) {
      console.error('Failed to send message:', err);
      throw new HttpException(
        err.response?.data?.error?.message || err.message || 'Failed to send',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async getAnalytics(tenantKey: string, userId: string, email: string) {
    const user = await this.businessUserService.findById(tenantKey, userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role.name !== 'business') throw new BadRequestException('Unauthorized');

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
        const diff = agentMsgs[0].created_at.getTime() - customerMsgs[0].created_at.getTime();
        totalResponseTime += diff;
        responded++;
      }
    }

    const avgResponse = responded > 0
      ? (totalResponseTime / responded / 1000 / 60).toFixed(1) + ' min'
      : 'N/A';

    return {
      success: true,
      data: { total, open, closed, pending, avgResponse },
    };
  }
}


