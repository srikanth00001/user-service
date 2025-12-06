import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('facebook_pages')
@Index(['pageId'], { unique: true })
@Index(['tenantKey'])
export class FacebookPage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tenant_key' })
  tenantKey: string; // ✔ Company level

  @Column({ name: 'connected_by_user_id' })
  connectedByUserId: string; // ✔ Master who connected it

  @Column({ name: 'page_id' })
  pageId: string;

  @Column({ name: 'page_name' })
  pageName: string;

  @Column({ name: 'access_token', type: 'text' })
  accessToken: string;

  @CreateDateColumn({ name: 'connected_at' })
  connectedAt: Date;

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  createdBy?: string;
}
