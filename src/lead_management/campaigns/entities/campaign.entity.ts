import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn } from 'typeorm';
import { Lead } from 'src/lead_management/leads/entities/lead.entity';


@Entity('campaign')
export class Campaign {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'varchar', nullable: true })
  secretKey?: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string;
 
  @OneToMany(() => Lead, (lead) => lead.campaign)
  leads: Lead[];

  @CreateDateColumn()
  createdAt: Date;
}
