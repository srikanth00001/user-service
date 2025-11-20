import { Injectable } from '@nestjs/common';
import { DatabaseManager } from '../../common/database/database.manager';
import { FacebookPage } from './entities/facebook-page.entity';

@Injectable()
export class FacebookPageService {
  constructor(private readonly dbManager: DatabaseManager) {}

  /**
   * Save or update connected page
   */
  async saveConnectedPage(data: {
    tenantKey: string;
    userId: string;
    pageId: string;
    pageName: string;
    accessToken: string;
  }) {
    console.log('📌 [saveConnectedPage] START', data);

    const dataSource = await this.dbManager.getOrCreateTenantConnection(data.tenantKey);
    if (!dataSource) {
      console.error('❌ Tenant DB not found for', data.tenantKey);
      throw new Error('Tenant DB not found');
    }

    const repo = dataSource.getRepository(FacebookPage);

    // Deactivate old pages for this user only
    const updateResult = await repo.update(
      { tenantKey: data.tenantKey, connectedByUserId: data.userId },
      { active: false },
    );
    console.log('🛠️ Old pages deactivated:', updateResult);

    // Check if page exists
    let page = await repo.findOne({ where: { pageId: data.pageId } });

    if (page) {
      console.log('📌 Updating existing page...', page);
      page.connectedByUserId = data.userId;
      page.pageName = data.pageName;
      page.accessToken = data.accessToken;
      page.active = true;
      page.tenantKey = data.tenantKey;

      const updated = await repo.save(page);
      console.log('✔ Page updated:', updated);
      return updated;
    }

    // Create new page
    console.log('📌 Creating new page...');
    page = repo.create({
      tenantKey: data.tenantKey,
      connectedByUserId: data.userId,
      pageId: data.pageId,
      pageName: data.pageName,
      accessToken: data.accessToken,
      active: true,
    });

    const saved = await repo.save(page);
    console.log('✔ New page saved:', saved);
    return saved;
  }

  /**
   * Get connected page for a specific user
   */
  async getConnectedPage(userId: string, tenantKey: string) {
    console.log(`📌 [getConnectedPage] Fetching page for user=${userId}, tenant=${tenantKey}`);

    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    if (!dataSource) {
      console.error('❌ Tenant DB not found for', tenantKey);
      throw new Error('Tenant DB not found');
    }

    const repo = dataSource.getRepository(FacebookPage);

    const page = await repo.findOne({
      where: { connectedByUserId: userId, active: true },
    });

    console.log('➡ Page Found:', page);
    return page;
  }

  /**
   * Find tenant by pageId across all tenant DBs
   */
  async findTenantByPageId(pageId: string): Promise<string | null> {
    console.log('📌 [findTenantByPageId] Searching for page:', pageId);

    for (const conn of this.dbManager['connections'].values()) {
      try {
        const repo = conn.dataSource.getRepository(FacebookPage);
        const found = await repo.findOne({ where: { pageId, active: true } });

        if (found) {
          console.log('✔ Page found under tenant:', found.tenantKey);
          return found.tenantKey;
        }
      } catch (error) {
        console.error('❌ Error scanning tenant DB:', error);
      }
    }

    console.log('❌ No tenant found for page:', pageId);
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
}
