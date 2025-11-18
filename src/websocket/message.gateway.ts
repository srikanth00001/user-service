// src/websocket/message.gateway.ts
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { BusinessUserService } from 'src/business-user/business-user.service';
import { ConversationService } from 'src/conversation/conversation.service';
import { MessageWithSender } from 'src/message/types/message-with-sender.interface';

@WebSocketGateway({ cors: { origin: '*' } })
export class MessageGateway {
  @WebSocketServer() server: Server;
  private logger = new Logger(MessageGateway.name);

  constructor(
    private eventEmitter: EventEmitter2,
    private businessUserService: BusinessUserService,
    private conversationService: ConversationService,
  ) {
    this.eventEmitter.on('message.created', (payload) => this.handleMessageCreated(payload));
    this.eventEmitter.on('messages.read', (payload) => this.handleMessagesRead(payload));
    this.eventEmitter.on('message.deleted', (payload) => this.handleMessageDeleted(payload));
    this.eventEmitter.on('message.reacted', (payload) => this.handleMessageReacted(payload));
  }

 async handleMessageCreated({
  message,
  conversationId,
}: {
  message: MessageWithSender & { tenantKey?: string };
  conversationId: number;
}) {
  console.log(`[MessageGateway.handleMessageCreated] Received message event for conversationId=${conversationId}, messageId=${message.id}`);

  // Use senderUser if already attached
  if (!message.senderUser) {
    // Only fetch if missing
    if (message.sender_user_id) {
      if (!message.tenantKey) {
        try {
          const conv = await this.conversationService.getTenantKey(conversationId);
          message.tenantKey = conv?.tenantKey;
        } catch (err) {
          console.warn(`[MessageGateway.handleMessageCreated] Failed to fetch tenantKey for conversationId=${conversationId}`);
        }
      }

      if (message.tenantKey) {
        const user = await this.businessUserService.findById(message.tenantKey, message.sender_user_id);
        message.senderUser = user ?? undefined;
      } else {
        console.warn(`[MessageGateway.handleMessageCreated] Cannot fetch sender: tenantKey missing`);
      }
    } else {
      console.log(`[MessageGateway.handleMessageCreated] Message has no sender_user_id`);
    }
  } else {
    console.log(`[MessageGateway.handleMessageCreated] Message already has senderUser populated`);
  }

  // Emit to clients
  this.server.to(`conv_${conversationId}`).emit('newMessage', message);
}


  handleMessagesRead({ conversationId, userId }: { conversationId: number; userId: string }) {
    this.server.to(`conv_${conversationId}`).emit('messagesRead', { conversationId, userId, read_at: new Date() });
  }

  handleMessageDeleted({ messageId, conversationId }: { messageId: number; conversationId: number }) {
    this.server.to(`conv_${conversationId}`).emit('messageDeleted', { messageId });
  }

  handleMessageReacted({ messageId, reaction, conversationId }: { messageId: number; reaction: string; conversationId: number }) {
    this.server.to(`conv_${conversationId}`).emit('messageReacted', { messageId, reaction });
  }

  emitNewMessage(message: MessageWithSender, conversationId: number) {
    this.server.to(`conv_${conversationId}`).emit('newMessage', message);
  }

  emitMessageReacted(messageId: number, reaction: string, conversationId: number) {
    this.server.to(`conv_${conversationId}`).emit('messageReacted', { messageId, reaction });
  }

  @SubscribeMessage('joinConversation')
  handleJoin(@MessageBody() data: { conversationId: number; userId: string; isCustomer?: boolean }, @ConnectedSocket() client: Socket) {
    client.data.userId = data.userId;
    client.data.isCustomer = data.isCustomer || false;
    client.join(`conv_${data.conversationId}`);
  }

  @SubscribeMessage('leaveConversation')
  handleLeave(@MessageBody() conversationId: number, @ConnectedSocket() client: Socket) {
    client.leave(`conv_${conversationId}`);
  }
}
