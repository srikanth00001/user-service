import { Plan } from 'src/plan/entities/plan.entity';
import { User } from 'src/user/entities/user.entity';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';


export enum SubscriptionStatus {
  ACTIVE = 'active',
  UPCOMING = 'upcoming',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}
@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Plan, (plan) => plan.subscriptions, { eager: true })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  @Column()
  plan_id: number;

  @Column('jsonb')
  plan_details: object;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
user_id: string;


  @Column()
  payment_mode: string; // Admin | {UPI/NEFT/DEBIT-CARD/CREDIT-CARD}

  @Column()
  start_date: Date;

  @Column()
  expiry_date: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference_id?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'uuid', nullable: true })
created_by?: string;

@Column({ type: 'uuid', nullable: true })
updated_by?: string;

@Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.UPCOMING,
  })
  status: SubscriptionStatus;

  @Column({default:true})
  active:boolean;
}
