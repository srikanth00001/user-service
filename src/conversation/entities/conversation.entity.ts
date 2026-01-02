// src/conversation/entities/conversation.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index } from 'typeorm';

@Entity('conversations')
@Index(['lead_id', 'source'], { unique: true })
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
  business_phone_number_id: string;

  @Column({ nullable: true })
  business_display_phone_number: string;

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

  @Column({ default: 'tenant' })
  initiated_by: 'tenant' | 'customer';

  @Column({ nullable: true })
  createdBy: string;

  @Column({ type: 'timestamp', nullable: true })
  scheduled_at: Date | null;

  @Column({ type: 'boolean', default: false })
  reminder_sent: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}
