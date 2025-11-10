import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Campaign } from '../../campaigns/entities/campaign.entity';

@Entity('google_ads_leads')
export class GoogleAdsLead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'gcl_id' })
  gclid: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  region?: string;

  @Column({ nullable: true, name: 'postal_code' })
  postalCode?: string;

  @Column({ type: 'jsonb', name: 'raw_payload' })
  rawPayload: Record<string, any>;

  @Column({ name: 'google_campaign_id', nullable: true })
  googleCampaignId?: string;

  @Column({ name: 'ad_group_id', nullable: true })
  adGroupId?: string;

  @Column({ name: 'creative_id', nullable: true })
  creativeId?: string;

  @ManyToOne(() => Campaign, { nullable: true })
  campaign?: Campaign | null;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
