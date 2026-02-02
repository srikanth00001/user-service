import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

// src/meta/entities/meta-app.entity.ts
@Entity('meta_apps')
export class MetaApp {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tenant_key' })
  tenantKey: string;

  @Column({ name: 'app_id' })
  appId: string;

  @Column({ name: 'app_secret' })
  appSecret: string;

  @Column({ name: 'redirect_uri' })
  redirectUri: string;

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  createdBy?: string;

  @CreateDateColumn()
  createdAt: Date;
}
