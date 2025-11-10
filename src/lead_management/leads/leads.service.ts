import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Lead } from './entities/lead.entity';
import { Note } from './entities/note.entity';
import { Temp } from './entities/template.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import * as XLSX from 'xlsx';
import { DatabaseManager } from '../../common/database/database.manager';
import { MetaLead } from '../facebook/entities/facebook.entity';
import { GoogleAdsLead } from '../google-ads/entities/google-ad.entity';
import { GoogleFormLead } from '../google-form/entities/google-form.entity';
import { ExcelLead } from './entities/excel-lead.entity';

@Injectable()
export class LeadsService {
  constructor(private dbManager: DatabaseManager) {}

  private getRepos(dataSource: DataSource) {
    return {
      lead: dataSource.getRepository(Lead),
      note: dataSource.getRepository(Note),
      template: dataSource.getRepository(Temp),
      campaign: dataSource.getRepository(Campaign),
    };
  }

  // ✅ Create Manual Lead (store email instead of userId)
  async create(dto: any, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const repo = dataSource.getRepository(Lead);

    return repo.save(repo.create({
      ...dto,
      source: dto.source || 'manual',
      createdBy: email,
    }));
  }

  // ✅ Fetch all manual leads (filter by email)
  async findAll(userId: string, email: string, role?: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email, role });
    const { lead: leadRepo } = this.getRepos(dataSource);

    const whereClause: any = role === 'business' ? {} : { createdBy: email };

    return leadRepo.find({
      where: whereClause,
      relations: ['campaign', 'notes'],
      order: { createdAt: 'DESC' },
    });
  }

 // leads.service.ts → getAllSources() → REPLACE THIS ENTIRE METHOD
async getAllSources(userId: string, email: string) {
  const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });

  const [manual, meta, gads, gform, excel] = await Promise.all([
    dataSource.getRepository(Lead).find({
      where: [{ createdBy: email }, { createdBy: userId }],
      relations: ['campaign'],
    }),
    dataSource.getRepository(MetaLead).find({
      where: [{ createdBy: email }, { createdBy: userId }],
      relations: ['campaign'],
    }),
    dataSource.getRepository(GoogleAdsLead).find({
      where: [{ createdBy: email }, { createdBy: userId }],
    }),
    dataSource.getRepository(GoogleFormLead).find({
      where: [{ createdBy: email }, { createdBy: userId }],
    }),
    dataSource.getRepository(ExcelLead).find({
      where: [{ createdBy: email }, { createdBy: userId }],
    }),
  ]);

  const unified: any[] = [];

  // Helper to generate unique React key
  const makeKey = (source: string, id: number) => `${source}-${id}`;

  // Manual Leads
  manual.forEach(l => {
    unified.push({
      ...l,
      source: 'manual',
      campaignName: l.campaign?.name || 'Manual Entry',
      _reactKey: makeKey('manual', l.id),
    });
  });

  // Meta Leads
  meta.forEach(l => {
    unified.push({
      ...l,
      source: 'meta',
      campaignName: l.campaign?.name || 'Meta Ads',
      _reactKey: makeKey('meta', l.id),
    });
  });

  // Google Ads
  gads.forEach(l => {
    unified.push({
      ...l,
      source: 'google_ads',
      campaignName: 'Google Ads',
      _reactKey: makeKey('google_ads', l.id),
    });
  });

  // Google Form
  gform.forEach(l => {
    unified.push({
      ...l,
      source: 'google_form',
      campaignName: 'Google Form',
      _reactKey: makeKey('google_form', l.id),
    });
  });

  // Excel Import
  excel.forEach(l => {
    unified.push({
      ...l,
      source: 'excel_import',
      campaignName: 'Excel Import',
      _reactKey: makeKey('excel', l.id),
    });
  });

  return {
    success: true,
    data: unified,
    total: unified.length,
  };
}

  // ✅ Add Note (store email)
  async addNote(leadId: number, content: string, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { lead: leadRepo, note: noteRepo } = this.getRepos(dataSource);

    const lead = await leadRepo.findOne({
      where: [
        { id: leadId, createdBy: email },
        { id: leadId, createdBy: userId },
      ],
    });
    if (!lead) throw new HttpException('Lead not found', HttpStatus.NOT_FOUND);

    const note = noteRepo.create({
      content,
      lead,
      createdBy: email,
    });
    return noteRepo.save(note);
  }

  // ✅ Get Notes
  async getNotes(leadId: number, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { note: noteRepo } = this.getRepos(dataSource);
    return noteRepo.find({
      where: { lead: { id: leadId } },
      order: { createdAt: 'DESC' },
    });
  }

  // ✅ Delete lead
  async delete(leadId: number, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { lead: leadRepo } = this.getRepos(dataSource);

    const lead = await leadRepo.findOne({
      where: [
        { id: leadId, createdBy: email },
        { id: leadId, createdBy: userId },
      ],
    });
    if (!lead) throw new HttpException('Lead not found', HttpStatus.NOT_FOUND);

    return leadRepo.softRemove(lead);
  }

 async importLeads(file: Express.Multer.File, userId: string, email: string) {
  if (!file?.mimetype.includes('spreadsheetml') && !file?.originalname.endsWith('.xlsx')) {
    throw new HttpException('Invalid Excel file. Please upload .xlsx', HttpStatus.BAD_REQUEST);
  }

  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet);

  const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
  const excelRepo = dataSource.getRepository(ExcelLead);

  let imported = 0;
  let skipped = 0;

  for (const row of jsonData as any[]) {
    try {
      const lead = excelRepo.create({
        externalLeadId: row.externalLeadId || `excel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: row.name || row.Name || null,
        email: row.email || row.Email || null,
        phone: row.phone || row.Phone || row.mobile || null,
        pageId: row.pageId || row.page_id || null,
        rawData: row,
        createdBy: email,
        source: 'excel_import',
      });

      await excelRepo.save(lead);
      imported++;
    } catch (err) {
      console.warn('Failed to import row:', row, err);
      skipped++;
    }
  }

  return {
    success: true,
    message: `Imported ${imported} leads${skipped > 0 ? `, ${skipped} skipped` : ''}`,
    imported,
    skipped,
  };}

  async createTemplate(dto: any, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { template: templateRepo } = this.getRepos(dataSource);

    const template = templateRepo.create({
      ...dto,
      created_by: email,
      updated_by: email,
    });
    return templateRepo.save(template);
  }

  async findAllTemplates(userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { template: templateRepo } = this.getRepos(dataSource);
    return templateRepo.find();
  }

  // ✅ Generate Lead Report
  async generateReport(leadId: number, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { lead: leadRepo } = this.getRepos(dataSource);

    const lead = await leadRepo.findOne({
      where: [
        { id: leadId, createdBy: email },
        { id: leadId, createdBy: userId },
      ],
      relations: ['campaign', 'notes'],
    });

    if (!lead) throw new HttpException('Lead not found', HttpStatus.NOT_FOUND);

    return {
      leadId: lead.id,
      externalLeadId: lead.externalLeadId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      campaign: lead.campaign
        ? { id: lead.campaign.id, name: lead.campaign.name }
        : null,
      notes: (lead.notes ?? []).map((n) => ({
        id: n.id,
        content: n.content,
        createdBy: n.createdBy,
        createdAt: n.createdAt,
      })),
    };
  }
}
