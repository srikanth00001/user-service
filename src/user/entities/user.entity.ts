import { Role } from 'src/role/entities/role.entity';
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

 @Column({ type: 'varchar' })
  firstName: string; 

  @Column({ type: 'varchar', nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  password: string;

  @Column({ type: 'varchar', unique: true })
  mobileNumber: string;

  @Column({ type: 'varchar' })
  address: string;

  @Column({ type: 'varchar' })
  city: string;

  @Column({ type: 'varchar' })
  state: string;

  @Column({ type: 'varchar' })
  country: string;

  @Column({ type: 'varchar', nullable: true })
  fcmId: string | null;

  @Column({ type: 'varchar', nullable: true })
  fcmToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLogin: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @ManyToOne(() => Role)
  role: Role;

  @Column({ type: 'varchar', nullable: true })
  emailVerificationToken: string | null;

  @Column({ type: 'varchar', nullable: true })
  resetOtpHash: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetOtpExpires: Date | null;

  @Column({ type: 'varchar', nullable: true })
  resetToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetTokenExpires: Date | null;

  @Column({ type: 'varchar', nullable: true })
  tenantKey?: string;
}
