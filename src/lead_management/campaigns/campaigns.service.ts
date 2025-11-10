// src/lead_management/campaigns/campaigns.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseManager } from '../../common/database/database.manager';
import { Campaign } from './entities/campaign.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly dbManager: DatabaseManager) {}

  private getRepo(dataSource: any) {
    return dataSource.getRepository(Campaign);
  }

  async create(dto: CreateCampaignDto, user: { id: string; email: string; tenantKey?: string }) {
    const { dataSource } = await this.dbManager.getConnectionForUser(user);
    const repo = this.getRepo(dataSource);

    const existing = await repo.findOne({
      where: {
        facebookCampaignId: dto.facebookCampaignId,
        pageId: dto.pageId,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Campaign already exists: ${dto.facebookCampaignId} / ${dto.pageId}`
      );
    }

    const campaign = repo.create({
      ...dto,
      createdBy: user.id,
    });

    return repo.save(campaign);
  }

  async findByFacebookId(
    pageId: string,
    facebookCampaignId: string,
    user: { id: string; email: string; tenantKey?: string },
  ) {
    const { dataSource } = await this.dbManager.getConnectionForUser(user);
    const repo = this.getRepo(dataSource);

    return repo.findOne({
      where: { pageId, facebookCampaignId, createdBy: user.id },
    });
  }

  async findAll(user: { id: string; email: string; tenantKey?: string }) {
    const { dataSource } = await this.dbManager.getConnectionForUser(user);
    const repo = this.getRepo(dataSource);
    return repo.find({
      where: { createdBy: user.id },
      relations: ['leads'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, user: { id: string; email: string; tenantKey?: string }) {
    const { dataSource } = await this.dbManager.getConnectionForUser(user);
    const repo = this.getRepo(dataSource);

    const campaign = await repo.findOne({
      where: { id, createdBy: user.id },
      relations: ['leads'],
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }

    return campaign;
  }

  async update(id: number, dto: CreateCampaignDto, user: { id: string; email: string; tenantKey?: string }) {
    const campaign = await this.findOne(id, user);
    const { dataSource } = await this.dbManager.getConnectionForUser(user);
    const repo = this.getRepo(dataSource);

    Object.assign(campaign, dto);
    return repo.save(campaign);
  }

  async remove(id: number, user: { id: string; email: string; tenantKey?: string }) {
    const campaign = await this.findOne(id, user);
    const { dataSource } = await this.dbManager.getConnectionForUser(user);
    const repo = this.getRepo(dataSource);

    await repo.remove(campaign);
    return { message: `Campaign ${id} deleted` };
  }
}