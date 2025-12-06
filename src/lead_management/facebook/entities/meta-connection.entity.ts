// src/meta/entities/meta-connection.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('meta_connections')
@Index(['tenantKey'])
@Index(['phoneNumberId'], { unique: true })
export class MetaConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tenant_key' })
  tenantKey: string;

  @Column({ name: 'connected_by_user_id' })
  connectedByUserId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  businessManagerId: string;


  @Column({ name: 'waba_id' })
  wabaId: string;

  @Column({ name: 'phone_number_id' })
  phoneNumberId: string;

  @Column({ name: 'phone_number' }) // e.g., 919876543210
  phoneNumber: string;

  @Column({ name: 'display_phone_number' })
  displayPhoneNumber: string;

  @Column({ name: 'access_token', type: 'text' })
  accessToken: string;

  @Column({ default: false })
  verified: boolean;

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'connected_at' })
  connectedAt: Date;
}