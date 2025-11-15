// src/message/entities/message.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { BusinessUser } from 'src/business-user/entities/business-user.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Conversation)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column()
  conversation_id: number;

  @Column({ type: 'uuid', nullable: true })
  sender_user_id: string;

  @Column('text')
  content: string;

  @Column({ default: 'text' })
  type: string;

  @Column({ default: false })
  isRead: boolean;

  @Column({ nullable: true })
  read_at: Date;

  @Column('simple-array', { nullable: true })
  labels: string[];

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true })
  reaction?: string;

  @Column({ nullable: true })
  parent_message_id: number;

  @ManyToOne(() => Message, { nullable: true })
  @JoinColumn({ name: 'parent_message_id' })
  parentMessage: Message;

  @Column({ default: false })
  deleted_for_me: boolean;

  @Column({ default: false })
  deleted_for_everyone: boolean;

  @Column({ nullable: true })
  filename?: string;

  @Column({ nullable: true })
  whatsapp_message_id: string;

  @Column({ default: false })
  view_once: boolean;

  @Column({ default: false })
  viewed: boolean;

  @Column({ nullable: true })
  media_url?: string;

  @ManyToOne(() => BusinessUser, { nullable: true })
  senderUser?: BusinessUser;
}