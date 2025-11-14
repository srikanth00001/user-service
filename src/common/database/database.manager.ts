// src/common/database/database.manager.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Lead } from '../../lead_management/leads/entities/lead.entity';
import { Note } from '../../lead_management/leads/entities/note.entity';
import { Temp } from '../../lead_management/leads/entities/template.entity';
import { Campaign } from '../../lead_management/campaigns/entities/campaign.entity';
import { User } from '../../user/entities/user.entity';
import { extractTenantDomain } from '../tenant/tenant.utils';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { Role } from 'src/role/entities/role.entity';
import { BusinessUser } from 'src/business-user/entities/business-user.entity';
import { BusinessRole } from 'src/business-role/entities/business-role.entity';
import { BusinessPermission } from 'src/business-permission/entities/business-permission.entity';
import { GoogleAdsLead } from 'src/lead_management/google-ads/entities/google-ad.entity';
import { MetaLead } from 'src/lead_management/facebook/entities/facebook.entity';
import { GoogleFormLead } from 'src/lead_management/google-form/entities/google-form.entity';
import { ExcelLead } from 'src/lead_management/leads/entities/excel-lead.entity';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { Message } from 'src/message/entities/message.entity';
import { AgentAssignment } from 'src/agent-assignment/entities/agent-assignment.entity';

export interface TenantConnection {
  name: string;
  dataSource: DataSource;
  leadCount: number;
}

@Injectable()
export class DatabaseManager implements OnModuleInit {
  private readonly logger = new Logger(DatabaseManager.name);
  private connections: Map<string, TenantConnection> = new Map();

  // ─────────────────────────────────────────────────────────────────────
  //  SHARDING RULES
  // ─────────────────────────────────────────────────────────────────────
  private readonly MAX_USERS_PER_PERSONAL_DB = 5;      // 5 personal users per DB
  private readonly PERSONAL_DB_PREFIX = 'digiwebspot';

  private readonly baseConfig: Omit<PostgresConnectionOptions, 'database'> = {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'Srikanth@03',
    synchronize: true,
    logging: false,
    entities: [Lead, Note, Temp, Campaign,BusinessUser, BusinessRole, BusinessPermission,MetaLead,ExcelLead,
  GoogleAdsLead,
  GoogleFormLead,Conversation,Message,AgentAssignment],
  };

  private masterDataSource!: DataSource;

  async onModuleInit() {
    this.logger.log('Initializing Database Manager...');
    await this.ensureMasterConnection();
    await this.createInitialDigiwebspotDb();
  }

  // --------------------------------------------------------------------
  //  MASTER CONNECTION
  // --------------------------------------------------------------------
  private async ensureMasterConnection() {
    if (!this.masterDataSource) {
      const masterOpts: PostgresConnectionOptions = {
        ...this.baseConfig,
        database: 'postgres',
        entities: [User, Role],
      };
      this.masterDataSource = new DataSource(masterOpts);
      await this.masterDataSource.initialize();
    }
  }

  private async createInitialDigiwebspotDb() {
    await this.getOrCreateTenantConnection(`${this.PERSONAL_DB_PREFIX}_1`);
  }

  // --------------------------------------------------------------------
  //  DB NAME NORMALISATION
  // --------------------------------------------------------------------
  private normalizeDbName(key: string): string {
    // PostgreSQL identifiers cannot contain '.' → replace with '_'
    return key.replace(/\./g, '_').toLowerCase();
  }

  // --------------------------------------------------------------------
  //  DATABASE EXISTENCE / CREATION
  // --------------------------------------------------------------------
  private async databaseExists(dbName: string): Promise<boolean> {
    try {
      const result = await this.masterDataSource.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [dbName]
      );
      return result.length > 0;
    } catch {
      return false;
    }
  }

  private async createDatabase(dbName: string) {
    try {
      await this.masterDataSource.query(`CREATE DATABASE "${dbName}"`);
      this.logger.log(`Database created: ${dbName}`);
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  // --------------------------------------------------------------------
  //  TENANT CONNECTION (cached)
  // --------------------------------------------------------------------
  async getOrCreateTenantConnection(tenantKey: string): Promise<DataSource> {
    if (this.connections.has(tenantKey)) {
      return this.connections.get(tenantKey)!.dataSource;
    }

    const dbName = this.normalizeDbName(tenantKey);

    if (!(await this.databaseExists(dbName))) {
      await this.createDatabase(dbName);
    }

    const config: PostgresConnectionOptions = {
      ...this.baseConfig,
      name: tenantKey,
      database: dbName,
      entities: [
    Lead,
    Note,
    Temp,
    Campaign,
    BusinessUser,
    BusinessRole,
    BusinessPermission,
    MetaLead,
    ExcelLead,
  GoogleAdsLead,
  GoogleFormLead,
  Conversation,Message,AgentAssignment
  ], 
    };

    const dataSource = new DataSource(config);
    await dataSource.initialize();
    this.logger.log(`Tenant connection initialized: ${tenantKey} → ${dbName}`);

    const leadCount = await dataSource.getRepository(Lead).count();
    this.connections.set(tenantKey, { name: tenantKey, dataSource, leadCount });
    return dataSource;
  }

  // --------------------------------------------------------------------
  //  PUBLIC HELPERS
  // --------------------------------------------------------------------
  public getMasterDataSource(): DataSource {
    if (!this.masterDataSource) {
      throw new Error('Master DataSource not initialized');
    }
    return this.masterDataSource;
  }

  public getMasterRepository<T>(entity: new () => T) {
    return this.getMasterDataSource().getRepository(entity);
  }

  // --------------------------------------------------------------------
  //  MAIN ENTRY POINT – decides which DB a user belongs to
  // --------------------------------------------------------------------
  async getConnectionForUser(
    user: { id: string; email: string; tenantKey?: string; role?: string }
  ): Promise<{ dataSource: DataSource; tenantKey: string }> {
    // 1. Already assigned → use it
    if (user.tenantKey) {
      const ds = await this.getOrCreateTenantConnection(user.tenantKey);
      return { dataSource: ds, tenantKey: user.tenantKey };
    }

    const domain = extractTenantDomain(user.email);
    const personalDomains = [
      'gmail_com', 'yahoo_com', 'outlook_com', 'hotmail_com',
      'zoho_com', 'icloud_com', 'aol_com', 'protonmail_com',
    ];

    let tenantKey: string;

    // ── BUSINESS USER ───────────────────────────────────────────────────────
    if (!personalDomains.includes(domain) && domain !== 'digiwebspot') {
      tenantKey = domain;                     // ONE DB ONLY
    }
    // ── PERSONAL USER ───────────────────────────────────────────────────────
    else {
      tenantKey = await this.findOrCreateDigiwebspotDb(user.id);
    }

    // Persist the chosen tenantKey **immediately**
    await this.updateUserTenantKey(user.id, tenantKey);

    const ds = await this.getOrCreateTenantConnection(tenantKey);
    return { dataSource: ds, tenantKey };
  }

  // --------------------------------------------------------------------
  //  UPDATE USER TENANT KEY (master DB)
  // --------------------------------------------------------------------
  private async updateUserTenantKey(userId: string, tenantKey: string) {
    try {
      await this.masterDataSource
        .createQueryBuilder()
        .update(User)
        .set({ tenantKey })
        .where('id = :id', { id: userId })
        .execute();
    } catch (error: any) {
      this.logger.warn(`Failed to update tenantKey: ${error.message}`);
    }
  }

  // --------------------------------------------------------------------
  //  PERSONAL DB SHARDING – 5 distinct users per DB
  // --------------------------------------------------------------------
  public async findOrCreateDigiwebspotDb(userId: string): Promise<string> {
    let suffix = 1;
    while (true) {
      const tenantKey = `${this.PERSONAL_DB_PREFIX}_${suffix}`;

      // 1. **Always ensure the DB exists** (creates it if needed)
      await this.getOrCreateTenantConnection(tenantKey);

      // 2. Count distinct users that already have at least one lead
      const dataSource = this.connections.get(tenantKey)!.dataSource;
      const userCount = await dataSource
  .createQueryBuilder()
  .select('COUNT(DISTINCT lead.created_by)', 'cnt')
  .from(Lead, 'lead')
  .getRawOne()
  .then(r => Number(r.cnt ?? 0));


      // 3. Room for a new user → assign this DB
      if (userCount < this.MAX_USERS_PER_PERSONAL_DB) {
        return tenantKey;
      }

      suffix++;
    }
  }

  // --------------------------------------------------------------------
  //  OPTIONAL: keep lead count cached for UI
  // --------------------------------------------------------------------
  async refreshLeadCount(tenantKey: string) {
    const conn = this.connections.get(tenantKey);
    if (conn) {
      const count = await conn.dataSource.getRepository(Lead).count();
      conn.leadCount = count;
    }
  }
}