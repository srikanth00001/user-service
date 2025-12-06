// src/lead-assignment/entities/agent-assignment.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('lead_assignments')
export class AgentAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', default: 'manual' })
  leadSource: string;


  @Column({ name: 'lead_id' })
  leadId: number;

  @Column()
  assigned_agent_id: string;

  @Column({ nullable: true })
  assigned_by?: string;

  @Column({ nullable: true })
  createdBy?: string;

  @CreateDateColumn()
  created_at: Date;
}