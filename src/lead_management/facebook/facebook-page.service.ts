import { Injectable } from '@nestjs/common';
import { DatabaseManager } from '../../common/database/database.manager';
import { FacebookPage } from './entities/facebook-page.entity';

@Injectable()
export class FacebookPageService {
  constructor(private readonly dbManager: DatabaseManager) { }

  /**
   * Save or update a connected Facebook Page (Multiple pages allowed)
   */
  async saveConnectedPage(data: {
    tenantKey: string;
    userId: string;
    pageId: string;
    pageName: string;
    accessToken: string;
  }) {
    console.log('Saving page:', data);
    const dataSource = await this.dbManager.getOrCreateTenantConnection(data.tenantKey);
    if (!dataSource) throw new Error('Tenant DB not found');

    const repo = dataSource.getRepository(FacebookPage);

    let page = await repo.findOne({
      where: { pageId: data.pageId, tenantKey: data.tenantKey },
    });

    if (page) {
      page.pageName = data.pageName;
      page.accessToken = data.accessToken;
      page.connectedByUserId = data.userId;
      page.active = true;
      // Set createdBy if not already set
      if (!page.createdBy) {
        page.createdBy = data.userId;
      }
    } else {
      page = repo.create({
        tenantKey: data.tenantKey,
        connectedByUserId: data.userId,
        createdBy: data.userId,
        pageId: data.pageId,
        pageName: data.pageName,
        accessToken: data.accessToken,
        active: true,
      });
    }

    const saved = await repo.save(page);
    console.log('Page saved/updated:', saved);
    return saved;
  }

  /**
   * Get ALL active connected pages for a user
   */
  async getConnectedPages(userId: string, tenantKey: string): Promise<FacebookPage[]> {
    console.log(`Fetching pages for tenant=${tenantKey} (user=${userId})`);
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    if (!dataSource) throw new Error('Tenant DB not found');

    const repo = dataSource.getRepository(FacebookPage);
    const pages = await repo.find({
      where: { tenantKey, active: true },
      order: { pageName: 'ASC' },
    });

    console.log('Tenant pages:', pages);
    return pages;
  }

  /**
   * Find tenant by pageId (for webhook routing)
   */
  async findTenantByPageId(pageId: string): Promise<string | null> {
    for (const conn of this.dbManager['connections'].values()) {
      try {
        const repo = conn.dataSource.getRepository(FacebookPage);
        const found = await repo.findOne({ where: { pageId, active: true } });
        if (found) return found.tenantKey;
      } catch (error) {
        console.error('Error scanning tenant DB:', error);
      }
    }
    return null;
  }

  async getPageById(pageId: string): Promise<FacebookPage | null> {
    for (const conn of this.dbManager['connections'].values()) {
      try {
        const repo = conn.dataSource.getRepository(FacebookPage);
        const page = await repo.findOne({ where: { pageId, active: true } });
        if (page) return page;
      } catch (err) {
        console.error('Error fetching page by id:', err);
      }
    }
    return null;
  }

  // Optional: Disconnect page
  async disconnectPage(pageId: string, tenantKey: string): Promise<void> {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    if (!dataSource) throw new Error('Tenant DB not found');
    const repo = dataSource.getRepository(FacebookPage);
    await repo.update({ pageId }, { active: false });
  }
}
