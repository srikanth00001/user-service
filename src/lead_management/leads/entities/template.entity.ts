import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('template')
export class Temp {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', type: 'text' })
  name: string;

  @Column('jsonb')
  template_type: Record<string, any>;

  @Column('text')
  content: string;

  @Column({ type: 'text', nullable: true })
  image?: string | null;

  @Column({ name: 'video_url', type: 'text', nullable: true })
  video_url?: string | null;

  @Column({ name: 'created_by', type: 'text', nullable: true })
created_by?: string | null;


  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // ✅ Explicit type added
  @Column({ name: 'updated_by', type: 'text', nullable: true })
  updated_by?: string | null;

  @Column({ name: 'active', type: 'boolean', default: true })
  active: boolean;
}
