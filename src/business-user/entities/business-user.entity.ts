import { BusinessRole } from 'src/business-role/entities/business-role.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('business_user')
export class BusinessUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 150, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 15, unique: true })
  mobileNumber: string;

  // ✅ Address as structured JSON (street, city, pincode, etc.)
  @Column({ type: 'jsonb', nullable: true })
  address:
    | {
        street?: string;
        area?: string;
        pincode?: string;
      }
    | null;

  // ✅ Simple string columns for location info
  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationToken: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resetToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetTokenExpires: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'varchar', length: 255 })
  tenantKey: string;

  @ManyToOne(() => BusinessRole, { eager: true })
  role: BusinessRole;

   @Column({ nullable: true })
  createdBy?: string;


  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
