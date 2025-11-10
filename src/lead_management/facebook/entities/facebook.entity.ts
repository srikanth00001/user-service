// src/lead_management/leads/entities/meta-lead.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from 'typeorm';
import { Campaign } from '../../campaigns/entities/campaign.entity';

@Entity('meta_leads')
@Index(['leadgenId'], { unique: true })
export class MetaLead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'leadgen_id' })
  leadgenId: string;

  @Column({ name: 'page_id' })
  pageId: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'jsonb', name: 'field_data' })
  fieldData: Record<string, any>;

  @Column({ name: 'form_id', nullable: true })
  formId?: string;

  @Column({ name: 'ad_id', nullable: true })
  adId?: string;

  @Column({ name: 'adset_id', nullable: true })
  adsetId?: string;

  @Column({ name: 'facebook_campaign_id', nullable: true })
  facebookCampaignId?: string;

  @ManyToOne(() => Campaign, campaign => campaign.id, { nullable: true })
  campaign?: Campaign | null;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}