// src/lead_management/google-form/google-form.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseManager } from '../../common/database/database.manager';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { GoogleFormLead } from './entities/google-form.entity';

@Injectable()
export class GoogleFormService {
  constructor(private readonly dbManager: DatabaseManager) {}

  async handleWebhook(payload: any, publisherEmail: string) {
    const { email, name, phone, externalLeadId, allFields, campaignId } = payload;

    if (!email) throw new HttpException('Email required', HttpStatus.BAD_REQUEST);
    if (!externalLeadId) throw new HttpException('responseId required', HttpStatus.BAD_REQUEST);

    const { dataSource } = await this.dbManager.getConnectionForUser({
      id: 'google-form-system',
      email: publisherEmail,
    });

    const repo = dataSource.getRepository(GoogleFormLead);

    if (await repo.findOne({ where: { responseId: externalLeadId } })) {
      return { status: 'success', message: 'already_saved' };
    }

    let campaign: Campaign | null = null;
    if (campaignId) {
      campaign = await dataSource.getRepository(Campaign).findOne({
        where: { id: Number(campaignId) },
      });
    }

    const lead = repo.create({
      responseId: externalLeadId,
      name: name ?? null,
      email,
      phone: phone ?? null,
      answers: allFields || payload,
      formId: payload.formId || 'unknown',
      campaign,
      createdBy: publisherEmail,
    });

    const saved = await repo.save(lead);
    return { status: 'success', leadId: saved.id };
  }
}