import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('phone_tenant_map')
@Index(['phone'], { unique: true })
export class PhoneTenantMap {
  @PrimaryColumn()
  phone: string;

  @Column()
  tenantKey: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}