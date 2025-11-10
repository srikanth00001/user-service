import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn } from 'typeorm';
import { Lead } from 'src/lead_management/leads/entities/lead.entity';

@Entity('campaign')
export class Campaign {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  facebookCampaignId: string;

  @Column()
  pageId: string;

  @Column({ type: 'varchar', nullable: true })
  createdBy?: string | null;

  @OneToMany(() => Lead, (lead) => lead.campaign)
  leads: Lead[];

  @CreateDateColumn()
  createdAt: Date;
}
