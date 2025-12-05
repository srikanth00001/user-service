// src/message/message.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Message } from './entities/message.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { DatabaseManager } from 'src/common/database/database.manager';
import { BusinessUser } from 'src/business-user/entities/business-user.entity';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import { MetaConnection } from 'src/lead_management/facebook/entities/meta-connection.entity';
import * as fs from 'fs/promises';
import * as path from 'path';

// Import shared interface
import { MessageWithSender } from './types/message-with-sender.interface';

@Injectable()
export class MessageService {

  private readonly logger = new Logger(MessageService.name);
  constructor(
    private readonly dbManager: DatabaseManager,
    private readonly whatsAppService: WhatsAppService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async getRepos(dataSource: DataSource) {
    return {
      message: dataSource.getRepository(Message),
      conversation: dataSource.getRepository(Conversation),
      businessUser: dataSource.getRepository(BusinessUser),
    };
  }

  async create(
    tenantKey: string,
    dto: CreateMessageDto,
    userId: string,
    email: string,
    whatsappMessageId?: string,
  ): Promise<{ success: true; data: MessageWithSender }> {
    this.logger.log('=== MESSAGE CREATE START ===');
    this.logger.log(`User: ${userId} | DTO:`, dto);

    try {
      const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
      const { message: msgRepo, conversation: convRepo, businessUser: userRepo } = await this.getRepos(dataSource);

      // 1. Validate conversation
      const conv = await convRepo.findOne({ where: { id: dto.conversation_id } });
      if (!conv) throw new NotFoundException('Conversation not found');

      // 2. Get parent WhatsApp message ID (for replies)
      let parentWhatsAppMessageId: string | undefined;
      if (dto.parent_message_id) {
        const parentMsg = await msgRepo.findOne({
          where: { id: dto.parent_message_id },
          select: ['id', 'whatsapp_message_id'],
        });
        if (!parentMsg) throw new NotFoundException('Parent message not found');
        parentWhatsAppMessageId = parentMsg.whatsapp_message_id || undefined;
      }

      // 3. Validate sender
      const senderUserId = dto.sender_user_id || userId;
      if (senderUserId) {
        const sender = await userRepo.findOne({ where: { id: senderUserId } });
        if (!sender) throw new NotFoundException('Sender user not found');
      }

      // 4. Input validation
      if (dto.view_once && dto.type && !['image', 'video'].includes(dto.type)) {
        throw new BadRequestException('view_once only allowed for image/video');
      }
      if (dto.type === 'text' && !dto.content?.trim()) {
        throw new BadRequestException('Text message cannot be empty');
      }

      // 5. Create & save message
      const msgEntity = msgRepo.create({
        conversation_id: dto.conversation_id,
        sender_user_id: senderUserId || undefined,
        content: dto.content || '',
        type: dto.type || 'text',
        parent_message_id: dto.parent_message_id,
        view_once: dto.view_once ?? false,
        whatsapp_message_id: whatsappMessageId ?? undefined,
      });

      const saved = await msgRepo.save(msgEntity);
      this.logger.log(`Message saved to DB: ${saved.id}`);

      // 6. Attach sender info
      const savedWithSender = saved as MessageWithSender;
      if (saved.sender_user_id) {
        const sender = await userRepo.findOne({ where: { id: saved.sender_user_id } });
        savedWithSender.senderUser = sender ?? undefined;
      }

      // 7. SEND TO WHATSAPP (only outgoing agent messages)
      if (senderUserId && dto.type === 'text' && dto.content?.trim()) {
        let sentWhatsappId: string | undefined;


        try {
          const metaRepo = dataSource.getRepository(MetaConnection);
          const overrideConn = conv.business_phone_number_id
            ? await metaRepo.findOne({ where: { phoneNumberId: conv.business_phone_number_id, tenantKey } })
            : null;

          if (!overrideConn) {
            throw new NotFoundException('WhatsApp connection not found for this conversation. Please connect your WhatsApp Business account.');
          }

          const opts = {
            phoneNumberId: overrideConn.phoneNumberId,
            accessToken: overrideConn.accessToken
          };

          if (parentWhatsAppMessageId) {
            this.logger.log(`Sending REPLY to WhatsApp message ID: ${parentWhatsAppMessageId}`);
            sentWhatsappId = await this.whatsAppService.sendReplyMessage(
              conv.phone_number,
              dto.content.trim(),
              parentWhatsAppMessageId,
              opts
            );
          } else {
            sentWhatsappId = await this.whatsAppService.sendTextMessage(
              conv.phone_number,
              dto.content.trim(),
              opts
            );
          }

          // Save WhatsApp message ID for future replies
          if (sentWhatsappId && sentWhatsappId !== 'sent') {
            await msgRepo.update(saved.id, { whatsapp_message_id: sentWhatsappId });
            savedWithSender.whatsapp_message_id = sentWhatsappId;
            this.logger.log(`WhatsApp message ID saved: ${sentWhatsappId}`);
          }
        } catch (waError: any) {
          this.logger.error('Failed to send message to WhatsApp', {
            error: waError.message,
            phone: conv.phone_number,
            content: dto.content,
            replyTo: parentWhatsAppMessageId,
          });
          // Don't fail the whole operation
        }
      }

      // 8. Emit event
      this.eventEmitter.emit('message.created', {
        message: savedWithSender,
        conversationId: dto.conversation_id,
        tenantKey,
        phoneNumber: conv.phone_number,
      });

      this.logger.log('=== MESSAGE CREATE SUCCESS ===');
      return { success: true, data: savedWithSender };
    } catch (error) {
      this.logger.error('Message creation failed', error.stack);
      throw error;
    }
  }


  async findByConversation(
    tenantKey: string,
    conversationId: number,
    userId: string,
    email: string,
  ): Promise<{ success: true; data: MessageWithSender[] }> {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const messages = await msgRepo.find({
      where: { conversation_id: conversationId, deleted_for_everyone: false },
      order: { created_at: 'ASC' },
    });

    const result: MessageWithSender[] = messages.map((msg) => msg as MessageWithSender);

    for (const msg of result) {
      if (msg.sender_user_id) {
        const user = await userRepo.findOne({ where: { id: msg.sender_user_id } });
        msg.senderUser = user ?? undefined;
      }
    }

    return { success: true, data: result };
  }

  async markRead(
    tenantKey: string,
    conversationId: number,
    userId: string,
    email: string,
  ): Promise<{ success: true; message: string }> {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo } = await this.getRepos(dataSource);

    await msgRepo.update(
      { conversation_id: conversationId, isRead: false },
      { isRead: true, read_at: new Date() },
    );

    this.eventEmitter.emit('messages.read', { conversationId, userId });

    return { success: true, message: 'Marked as read' };
  }

  async upload(
    tenantKey: string,
    messageId: number,
    file: Express.Multer.File,
    userId: string,
    email: string,
    view_once = false,
  ): Promise<{ success: true; data: MessageWithSender }> {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo, conversation: convRepo } = await this.getRepos(dataSource);

    const msg = await msgRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');

    const conv = await convRepo.findOne({ where: { id: msg.conversation_id } });
    if (!conv) throw new NotFoundException('Conversation not found');

    const tmpDir = path.join(process.cwd(), 'tmp');
    const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = path.join(tmpDir, safeFileName);

    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(filePath, file.buffer);

    // CRITICAL FIX: CORRECT MAPPING FROM MIME → WHATSAPP TYPE
    const mime = file.mimetype.toLowerCase();

    let whatsappMediaType: 'image' | 'video' | 'document' | 'audio';

    if (mime.startsWith('image/')) {
      whatsappMediaType = 'image';
    } else if (mime.startsWith('video/')) {
      whatsappMediaType = 'video';
    } else if (mime.startsWith('audio/')) {
      whatsappMediaType = 'audio';
    } else {
      whatsappMediaType = 'document';
    }


    // Upload to WhatsApp
    const metaRepo = dataSource.getRepository(MetaConnection);
    const overrideConn = conv.business_phone_number_id
      ? await metaRepo.findOne({ where: { phoneNumberId: conv.business_phone_number_id, tenantKey } })
      : null;

    if (!overrideConn) {
      throw new NotFoundException('WhatsApp connection not found for this conversation. Please connect your WhatsApp Business account.');
    }

    const opts = {
      phoneNumberId: overrideConn.phoneNumberId,
      accessToken: overrideConn.accessToken
    };

    const mediaId = await this.whatsAppService.uploadMedia(filePath, whatsappMediaType, opts);
    const mediaUrl = await this.whatsAppService.getMediaUrl(mediaId, { accessToken: overrideConn.accessToken });

    // Send correctly typed media
    const whatsappMessageId = await this.whatsAppService.sendMediaMessage(
      conv.phone_number,
      mediaId,
      whatsappMediaType,
      msg.content?.trim() || undefined,
      opts,
    );

    await msgRepo.update(messageId, {
      media_url: mediaUrl,
      filename: safeFileName,
      view_once,
      whatsapp_message_id: whatsappMessageId,
    });

    const updated = await msgRepo.findOne({ where: { id: messageId } });
    if (!updated) throw new NotFoundException('Updated message not found');

    const updatedWithSender: MessageWithSender = updated as MessageWithSender;
    if (updated.sender_user_id) {
      const user = await dataSource.getRepository(BusinessUser).findOne({
        where: { id: updated.sender_user_id },
      });
      updatedWithSender.senderUser = user ?? undefined;
    }

    this.eventEmitter.emit('message.created', {
      message: updatedWithSender,
      conversationId: updated.conversation_id,
      tenantKey,
      phoneNumber: conv.phone_number,
    });

    await fs.unlink(filePath).catch(() => { });

    return { success: true, data: updatedWithSender };
  }

  async forward(
    tenantKey: string,
    messageIds: number[],
    targetConversationId: number,
    userId: string,
    email: string,
  ): Promise<{ success: true; data: MessageWithSender[] }> {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const originals = await msgRepo.find({ where: { id: In(messageIds) } });
    if (originals.length === 0) throw new NotFoundException('No messages found');

    const forwarded: MessageWithSender[] = [];

    for (const orig of originals) {
      const fwd = msgRepo.create({
        conversation_id: targetConversationId,
        sender_user_id: userId,
        content: orig.content,
        type: orig.type,
        media_url: orig.media_url,
        filename: orig.filename,
        view_once: orig.view_once,
        parent_message_id: orig.id,
      });

      const saved = await msgRepo.save(fwd);
      const savedWithSender: MessageWithSender = saved as MessageWithSender;
      const user = await userRepo.findOne({ where: { id: userId } });
      savedWithSender.senderUser = user ?? undefined;
      forwarded.push(savedWithSender);
    }

    this.eventEmitter.emit('messages.forwarded', {
      messages: forwarded,
      targetConversationId,
    });

    return { success: true, data: forwarded };
  }

  async react(
    tenantKey: string,
    messageId: number,
    emoji: string,
    userId: string,
    email: string,
  ): Promise<{ success: true; data: MessageWithSender }> {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo } = await this.getRepos(dataSource);

    const msg = await msgRepo.findOne({
      where: { id: messageId },
      relations: ['conversation'],
    });
    if (!msg) throw new NotFoundException('Message not found');

    let waReactionSent = false;

    if (msg.whatsapp_message_id) {
      // Block reactions to messages older than 3 days (safe limit)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      if (msg.created_at >= threeDaysAgo) {
        try {
          const metaRepo = dataSource.getRepository(MetaConnection);
          const overrideConn = msg.conversation.business_phone_number_id
            ? await metaRepo.findOne({ where: { phoneNumberId: msg.conversation.business_phone_number_id, tenantKey } })
            : null;

          if (!overrideConn) {
            throw new NotFoundException('WhatsApp connection not found for this conversation. Please connect your WhatsApp Business account.');
          }

          await this.whatsAppService.sendReactionMessage(
            msg.conversation.phone_number,
            msg.whatsapp_message_id,
            emoji,
            { phoneNumberId: overrideConn.phoneNumberId, accessToken: overrideConn.accessToken },
          );
          waReactionSent = true;
          this.logger.log(`Reaction ${emoji} sent to WhatsApp (message ${messageId})`);
        } catch (error: any) {
          // Only log real errors (not 131000)
          if (error.response?.data?.error?.code !== 131000) {
            this.logger.error('Failed to send reaction', error.response?.data || error.message);
          }
          // Don't throw — still save locally
        }
      } else {
        this.logger.verbose('Reaction blocked: message too old (>3 days)');
      }
    }

    // Always save locally (for your team inbox)
    await msgRepo.update(messageId, { reaction: emoji });

    const updated = await msgRepo.findOne({ where: { id: messageId }, relations: ['conversation'] });
    const updatedWithSender = updated as MessageWithSender;
    // ... attach sender etc.

    this.eventEmitter.emit('message.reacted', {
      messageId,
      emoji,
      conversationId: msg.conversation_id,
      sentToWhatsApp: waReactionSent,
    });

    return { success: true, data: updatedWithSender };
  }

  async deleteForMe(
    tenantKey: string,
    messageId: number,
    userId: string,
    email: string,
  ): Promise<{ success: true }> {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo } = await this.getRepos(dataSource);

    const msg = await msgRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.sender_user_id !== userId) throw new ForbiddenException('Not your message');

    await msgRepo.update(messageId, { deleted_for_me: true });

    this.eventEmitter.emit('message.deleted.me', { messageId, userId });

    return { success: true };
  }

  async deleteForEveryone(
    tenantKey: string,
    messageId: number,
    userId: string,
    email: string,
  ): Promise<{ success: true }> {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo } = await this.getRepos(dataSource);

    const msg = await msgRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.sender_user_id !== userId) throw new ForbiddenException('Not your message');

    await msgRepo.update(messageId, {
      deleted_for_everyone: true,
      content: '',
      media_url: undefined,
      filename: undefined,
    });

    this.eventEmitter.emit('message.deleted.everyone', { messageId });

    return { success: true };
  }

  async findOne(
    tenantKey: string,
    messageId: number,
    userId: string,
    email: string,
  ): Promise<{ success: true; data: MessageWithSender }> {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const msg = await msgRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');

    const result: MessageWithSender = msg as MessageWithSender;
    if (msg.sender_user_id) {
      const user = await userRepo.findOne({ where: { id: msg.sender_user_id } });
      result.senderUser = user ?? undefined;
    }

    return { success: true, data: result };
  }

  async filterByLabel(tenantKey: string, label: string, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo } = await this.getRepos(dataSource);
    return msgRepo
      .createQueryBuilder('msg')
      .where('msg.labels @> :label', { label: [label] })
      .orWhere('msg.labels ILIKE :like', { like: `%${label}%` })
      .getMany();
  }

  async getUniqueLabels(tenantKey: string, conversationId: number, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo } = await this.getRepos(dataSource);
    const result = await msgRepo
      .createQueryBuilder('msg')
      .select('DISTINCT UNNEST(msg.labels)', 'label')
      .where('msg.conversation_id = :id', { id: conversationId })
      .getRawMany();
    return result.map((r) => r.label);
  }

  async addLabel(tenantKey: string, messageId: number, label: string, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo } = await this.getRepos(dataSource);
    const msg = await msgRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    msg.labels = [...new Set([...(msg.labels || []), label])];
    await msgRepo.save(msg);
    const updated = await msgRepo.findOne({ where: { id: messageId } });
    return { success: true, data: updated as MessageWithSender };
  }

  async removeLabel(tenantKey: string, messageId: number, label: string, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo } = await this.getRepos(dataSource);
    const msg = await msgRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    msg.labels = (msg.labels || []).filter((l) => l !== label);
    await msgRepo.save(msg);
    return { success: true };
  }

  async share(
    tenantKey: string,
    messageId: number,
    targetConversationId: number,
    userId: string,
    email: string,
    type?: string,
    media_url?: string,
    filename?: string,
  ) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { message: msgRepo } = await this.getRepos(dataSource);
    const orig = await msgRepo.findOne({ where: { id: messageId } });
    if (!orig) throw new NotFoundException('Message not found');

    const shared = msgRepo.create({
      conversation_id: targetConversationId,
      sender_user_id: userId,
      content: orig.content,
      type: orig.type,
      media_url: media_url || orig.media_url,
      filename: filename || orig.filename,
      view_once: orig.view_once,
      parent_message_id: orig.id,
    });

    const saved = await msgRepo.save(shared);
    return { success: true, data: saved };
  }
}
