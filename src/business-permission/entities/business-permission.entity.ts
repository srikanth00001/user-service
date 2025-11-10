import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BusinessRole } from 'src/business-role/entities/business-role.entity';

@Entity('business_permission')
export class BusinessPermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Store module-based permissions (like Lead Management, Customer Management)
  @Column({ type: 'jsonb', default: {} })
  permissions: Record<string, string[]>; // example: { "Lead Management": ["view", "edit"] }

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => BusinessRole, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: BusinessRole;
}
