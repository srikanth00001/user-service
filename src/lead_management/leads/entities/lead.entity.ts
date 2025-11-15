// src/lead_management/leads/entities/lead.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Campaign } from '../../campaigns/entities/campaign.entity';
import { Note } from './note.entity';

@Entity('manual_leads')
export class Lead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'external_lead_id', nullable: true })
  externalLeadId?: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ name: 'page_id', nullable: true })
  pageId?: string;

  @Column({ type: 'jsonb', name: 'all_fields', nullable: true })
  allFields?: any;

  @Column({ nullable: true })
  source?: string;

  @Column({ type: 'varchar', name: 'created_by', nullable: true })
createdBy?: string;

@Column({ type: 'varchar', nullable: true })
assignedTo: string | null;

  @ManyToOne(() => Campaign, { nullable: true })
  campaign?: Campaign;

  @OneToMany(() => Note, note => note.lead)
  notes?: Note[];

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt?: Date;
}