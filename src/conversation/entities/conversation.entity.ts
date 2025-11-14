// src/conversation/entities/conversation.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  lead_id: number;

  @Column()
  source: string;

  @Column()
  phone_number: string;

  @Column({ nullable: true })
  lead_name: string;

  @Column({ nullable: true })
  assigned_agent_id: string;

  @Column({ default: 'open' })
  status: 'open' | 'closed' | 'pending';

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  priority: 'Low' | 'Medium' | 'High' | 'Critical';

  @Column({ nullable: true })
  department: string;

  @Column({ nullable: true })
  topic: string;

  @Column({ nullable: true })
  channel: string;

  @Column({ nullable: true })
  sentiment: 'Happy' | 'Neutral' | 'Angry';

  @Column({ nullable: true })
  createdBy: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}