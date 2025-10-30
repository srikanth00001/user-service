import { Subscription } from 'src/subscription/entities/subscription.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';


@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  period: number; // 30, 90, 120

  @Column()
  amount: number;

  @Column({ nullable: true })
  offer_type?: string; // percentage/amount

  @Column({ nullable: true })
  offer_value?: number; // 10 or 100

  @Column({ nullable: true })
  offer_start_date?: Date;

  @Column({ nullable: true })
  offer_end_date?: Date;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true })
  created_by: number;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  updated_by: number;

  @OneToMany(() => Subscription, (subscription) => subscription.plan)
  subscriptions: Subscription[];
}