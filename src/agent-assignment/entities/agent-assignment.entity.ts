import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Lead } from 'src/lead_management/leads/entities/lead.entity';

@Entity('lead_assignments')
export class AgentAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column()
  lead_id: number;

  @Column()
  assigned_agent_id: string;

  @Column()
  assigned_by: string;

  @CreateDateColumn()
  created_at: Date;
}