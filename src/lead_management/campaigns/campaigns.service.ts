// src/lead_management/campaigns/campaigns.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseManager } from '../../common/database/database.manager';
import { Campaign } from './entities/campaign.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { randomBytes } from 'crypto';

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
        name: dto.name,
        createdBy: user.id,
      },
    });

    if (existing) {
      throw new ConflictException(`Campaign already exists: ${dto.name}`);
    }

    const campaign = repo.create({
      name: dto.name,
      active: dto.active ?? true,
      secretKey: randomBytes(24).toString('hex'),
      createdBy: user.id,
    });

    return repo.save(campaign);
  }

  async findByName(name: string, user: { id: string; email: string; tenantKey?: string }) {
    const { dataSource } = await this.dbManager.getConnectionForUser(user);
    const repo = this.getRepo(dataSource);
    return repo.findOne({ where: { name, createdBy: user.id } });
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

    if (dto.name) campaign.name = dto.name;
    if (typeof dto.active === 'boolean') campaign.active = dto.active;
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