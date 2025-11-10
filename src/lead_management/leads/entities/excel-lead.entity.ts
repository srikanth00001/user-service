// src/lead_management/leads/entities/excel-lead.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('excel_leads')
export class ExcelLead {
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

  @Column({ type: 'jsonb', name: 'raw_data', nullable: true })
  rawData?: any;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ default: 'excel_import' })
  source: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}