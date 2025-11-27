// src/message/message.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Message } from './entities/message.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { DatabaseManager } from 'src/common/database/database.manager';
import { BusinessUser } from 'src/business-user/entities/business-user.entity';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import * as fs from 'fs/promises';
import * as path from 'path';

// Import shared interface
import { MessageWithSender } from './types/message-with-sender.interface';

@Injectable()
export class MessageService {
  constructor(
    private readonly dbManager: DatabaseManager,
    private readonly whatsAppService: WhatsAppService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
  console.log('=== MESSAGE CREATE START ===');
  console.log('TenantKey:', tenantKey);
  console.log('UserID:', userId, 'Email:', email);
  console.log('Incoming DTO:', dto);

  try {
    // Get database connection for this tenant/user
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    console.log('DataSource retrieved');

    const { message: msgRepo, conversation: convRepo, businessUser: userRepo } = await this.getRepos(dataSource);
    console.log('Repositories initialized');

    // Check conversation exists
    const conv = await convRepo.findOne({ where: { id: dto.conversation_id } });
    console.log('Conversation found:', conv);
    if (!conv) throw new NotFoundException('Conversation not found');

    // Check sender user exists
    if (dto.sender_user_id) {
      const senderUser = await userRepo.findOne({ where: { id: dto.sender_user_id } });
      console.log('Sender user found:', senderUser);
      if (!senderUser) throw new NotFoundException('Sender user not found');
    }

    // Check parent message exists if replying
    if (dto.parent_message_id) {
      const parentMsg = await msgRepo.findOne({ where: { id: dto.parent_message_id } });
      console.log('Parent message found:', parentMsg);
      if (!parentMsg) throw new NotFoundException('Parent message not found');
    }

    // Validate view_once usage
    if (dto.view_once && dto.type && !['image', 'video'].includes(dto.type)) {
      console.log('Invalid view_once usage');
      throw new BadRequestException('view_once only allowed for image/video');
    }

    // Validate text content
    if (dto.type === 'text' && !dto.content?.trim()) {
      console.log('Text message content empty');
      throw new BadRequestException('Text message cannot be empty');
    }

    // Create message entity
    const msgEntity = msgRepo.create({
      conversation_id: dto.conversation_id,
      sender_user_id: dto.sender_user_id || userId,
      content: dto.content,
      type: dto.type,
      parent_message_id: dto.parent_message_id,
      view_once: dto.view_once ?? false,
      whatsapp_message_id: whatsappMessageId ?? undefined,
    });
    console.log('Message entity created:', msgEntity);

    // Save message
    const saved = await msgRepo.save(msgEntity);
    console.log('Message saved successfully:', saved);

    const savedWithSender = saved as MessageWithSender;

    // Attach sender user object
    if (saved.sender_user_id) {
      const sender = await userRepo.findOne({ where: { id: saved.sender_user_id } });
      savedWithSender.senderUser = sender ?? undefined;
      console.log('Attached sender user to message:', sender);
    }

    // Emit event
    this.eventEmitter.emit('message.created', {
  message: savedWithSender,
  conversationId: dto.conversation_id,
  tenantKey,                         // pass tenantKey
  phoneNumber: conv.phone_number,    // pass phone number for WhatsApp
});
    console.log('Event emitted: message.created');

    console.log('=== MESSAGE CREATE END ===');
    return { success: true, data: savedWithSender };
  } catch (error) {
    console.error('ERROR in MessageService.create:', error.message, error.stack);
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
  const mediaId = await this.whatsAppService.uploadMedia(filePath, whatsappMediaType);
  const mediaUrl = await this.whatsAppService.getMediaUrl(mediaId);

  // Send correctly typed media
  const whatsappMessageId = await this.whatsAppService.sendMediaMessage(
    conv.phone_number,
    mediaId,
    whatsappMediaType,
    msg.content?.trim() || undefined,
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

  await fs.unlink(filePath).catch(() => {});

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

    const msg = await msgRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');

    await msgRepo.update(messageId, { reaction: emoji });

    const updated = await msgRepo.findOne({ where: { id: messageId } });
    if (!updated) throw new NotFoundException('Updated message not found');

    const updatedWithSender: MessageWithSender = updated as MessageWithSender;
    if (updated.sender_user_id) {
      const user = await dataSource.getRepository(BusinessUser).findOne({
        where: { id: updated.sender_user_id },
      });
      updatedWithSender.senderUser = user ?? undefined;
    }

    this.eventEmitter.emit('message.reacted', {
      messageId,
      emoji,
      conversationId: msg.conversation_id,
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
    return { success: true };
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