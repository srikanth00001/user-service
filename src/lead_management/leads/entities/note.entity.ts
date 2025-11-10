import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Lead } from './lead.entity';

@Entity()
export class Note {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => Lead, (lead) => lead.notes, { onDelete: 'CASCADE' })
  lead: Lead;

  @Column()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}