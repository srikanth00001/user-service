// src/lead_management/leads/entities/google-form-lead.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from 'typeorm';
import { Campaign } from '../../campaigns/entities/campaign.entity';

@Entity('google_form_leads')
export class GoogleFormLead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'response_id' })
  responseId: string;

  @Column({ nullable: true })
  name?: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'jsonb' })
  answers: Record<string, any>;

  @Column({ name: 'form_id' })
  formId: string;

  @ManyToOne(() => Campaign, { nullable: true })
  campaign?: Campaign | null;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}