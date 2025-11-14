import { Message } from '../entities/message.entity';
import { BusinessUser } from 'src/business-user/entities/business-user.entity';

export interface MessageWithSender extends Message {
  senderUser?: BusinessUser | undefined; // Only undefined, not null
}