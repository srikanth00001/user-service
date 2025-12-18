// src/lead_management/leads/leads.service.ts
import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BusinessUser } from '../../business-user/entities/business-user.entity';
import { Lead } from './entities/lead.entity';
import { Note } from './entities/note.entity';
import { Temp } from './entities/template.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { MetaLead } from '../facebook/entities/facebook.entity';
import { GoogleAdsLead } from '../google-ads/entities/google-ad.entity';
import { GoogleFormLead } from '../google-form/entities/google-form.entity';
import { ExcelLead } from './entities/excel-lead.entity';
import { MessageService } from '../../message/message.service';
import { ConversationService } from '../../conversation/conversation.service';
import { CreateMessageDto } from '../../message/dto/create-message.dto';
import { CreateConversationDto } from '../../conversation/dto/create-conversation.dto';
import * as XLSX from 'xlsx';
import { DatabaseManager } from '../../common/database/database.manager';

@Injectable()
export class LeadsService {
  constructor(
    private dbManager: DatabaseManager,
    private messageService: MessageService,
    @Inject(forwardRef(() => ConversationService))
    private conversationService: ConversationService,
  ) { }

  private getRepos(dataSource: DataSource) {
    return {
      lead: dataSource.getRepository(Lead),
      note: dataSource.getRepository(Note),
      template: dataSource.getRepository(Temp),
      campaign: dataSource.getRepository(Campaign),
    };
  }

  async create(dto: any, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const repo = dataSource.getRepository(Lead);

    return repo.save(
      repo.create({
        ...dto,
        source: dto.source || 'manual',
        createdBy: userId,
        assignedTo: null,
      }),
    );
  }

  async findAll(userId: string, email: string, role?: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email, role });
    const { lead: leadRepo } = this.getRepos(dataSource);

    // Business role users (Owner, Manager, etc.) see ALL leads
    // Personal users see only their own leads
    const roleName = typeof role === 'object' ? (role as any)?.name : role;
    const isBusinessRole = roleName && ['owner', 'manager', 'business'].some(r =>
      roleName.toLowerCase().includes(r)
    );

    const whereClause: any = isBusinessRole ? {} : { createdBy: userId };

    return leadRepo.find({
      where: whereClause,
      relations: ['campaign', 'notes'],
      order: { createdAt: 'DESC' },
    });
  }

  async getAllSources(userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });

    const [manual, meta, gads, gform, excel] = await Promise.all([
      // Manual Leads
      dataSource.getRepository(Lead).find({
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          externalLeadId: true,
          createdAt: true,
        },
        where: { createdBy: userId },
        relations: ['campaign'],
      }),

      // Meta Leads
      dataSource.getRepository(MetaLead).find({
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
        },
        where: { createdBy: userId },
        relations: ['campaign'],
      }),

      // Google Ads Leads - CRITICAL FIX
      dataSource.getRepository(GoogleAdsLead).find({
        select: {
          id: true,
          gclid: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,           // This was missing!
        },
        relations: ['campaign'],       // To get campaign.name
        where: { createdBy: userId },
      }),

      // Google Form Leads
      dataSource.getRepository(GoogleFormLead).find({
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
        },
        where: { createdBy: userId },
        relations: ['campaign'],
      }),

      // Excel Leads
      dataSource.getRepository(ExcelLead).find({
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
        },
        where: { createdBy: userId },
      }),
    ]);

    const unified: any[] = [];
    const makeKey = (source: string, id: number) => `${source}-${id}`;

    const mapLeads = (leads: any[], source: string, defaultCampaignName: string) => {
      leads.forEach((l) => {
        if (!l.id) return; // safety

        unified.push({
          id: Number(l.id),
          name: l.name || '[No Name]',
          email: l.email || null,
          phone: l.phone || null,
          gclid: (l).gclid || null,
          externalLeadId: (l).externalLeadId || null,
          source,
          campaignName: l.campaign?.name || defaultCampaignName || 'Uncategorized',
          createdAt: l.createdAt
            ? new Date(l.createdAt).toISOString()
            : new Date().toISOString(),
          notesCount: 0, // Google Ads, Excel, etc. don't have notes yet
          _reactKey: makeKey(source, l.id),
        });
      });
    };

    mapLeads(manual, 'manual', 'Manual Entry');
    mapLeads(meta, 'meta', 'Meta Ads');
    mapLeads(gads, 'google_ads', 'Google Ads');
    mapLeads(gform, 'google_form', 'Google Form');
    mapLeads(excel, 'excel_import', 'Excel Import');

    // Sort by newest first
    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      success: true,
      data: unified,
      total: unified.length,
    };
  }



  async addNote(leadId: number, content: string, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { lead: leadRepo, note: noteRepo } = this.getRepos(dataSource);

    const lead = await leadRepo.findOne({
      where: { id: leadId, createdBy: userId },
    });
    if (!lead) throw new HttpException('Lead not found', HttpStatus.NOT_FOUND);

    const note = noteRepo.create({
      content,
      lead,
      createdBy: userId,
    });
    return noteRepo.save(note);
  }

  async getAssignedForUser(userId: string, email: string) {
    const { dataSource, tenantKey } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const assignmentRepo = dataSource.getRepository(require('../../agent-assignment/entities/agent-assignment.entity').AgentAssignment);

    const businessUserRepo = dataSource.getRepository(BusinessUser);
    const businessUser = await businessUserRepo.findOne({ where: { email } });
    const assignedId = businessUser?.id || userId;

    const assignments = await assignmentRepo.find({ where: { assigned_agent_id: assignedId } });
    const idsBySource: Record<string, number[]> = {};
    for (const a of assignments) {
      idsBySource[a.leadSource] = idsBySource[a.leadSource] || [];
      idsBySource[a.leadSource].push(a.leadId);
    }

    const results: any[] = [];

    const pushMapped = (rows: any[], source: string, defaultCampaignName: string) => {
      rows.forEach((l: any) => {
        if (!l) return;
        results.push({
          id: Number(l.id),
          name: l.name || '[No Name]',
          email: l.email || null,
          phone: l.phone || null,
          source,
          campaignName: l.campaign?.name || defaultCampaignName || 'Uncategorized',
          createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : new Date().toISOString(),
        });
      });
    };

    if (idsBySource.manual?.length) {
      const rows = await dataSource.getRepository(Lead).find({ where: idsBySource.manual.map((id) => ({ id })) });
      pushMapped(rows, 'manual', 'Manual Entry');
    }
    if (idsBySource.meta?.length) {
      const rows = await dataSource.getRepository(MetaLead).find({ where: idsBySource.meta.map((id) => ({ id })) });
      pushMapped(rows, 'meta', 'Meta Ads');
    }
    if (idsBySource.google_ads?.length) {
      const rows = await dataSource.getRepository(GoogleAdsLead).find({ where: idsBySource.google_ads.map((id) => ({ id })) });
      pushMapped(rows, 'google_ads', 'Google Ads');
    }
    if (idsBySource.google_form?.length) {
      const rows = await dataSource.getRepository(GoogleFormLead).find({ where: idsBySource.google_form.map((id) => ({ id })) });
      pushMapped(rows, 'google_form', 'Google Form');
    }
    if (idsBySource.excel_import?.length) {
      const rows = await dataSource.getRepository(ExcelLead).find({ where: idsBySource.excel_import.map((id) => ({ id })) });
      pushMapped(rows, 'excel_import', 'Excel Import');
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { success: true, data: results, total: results.length };
  }

  async getNotes(leadId: number, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { note: noteRepo } = this.getRepos(dataSource);
    return noteRepo.find({
      where: { lead: { id: leadId } },
      order: { createdAt: 'DESC' },
    });
  }

  async delete(leadId: number, source: string, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { lead: leadRepo } = this.getRepos(dataSource);

    let repo: any = leadRepo; // Default to manual/Lead

    switch (source) {
      case 'meta':
        repo = dataSource.getRepository(MetaLead);
        break;
      case 'google_ads':
        repo = dataSource.getRepository(GoogleAdsLead);
        break;
      case 'google_form':
        repo = dataSource.getRepository(GoogleFormLead);
        break;
      case 'excel_import':
        repo = dataSource.getRepository(ExcelLead);
        break;
      case 'manual':
      default:
        repo = leadRepo;
        break;
    }

    const lead = await repo.findOne({
      where: { id: leadId, createdBy: userId },
    });

    if (!lead) throw new HttpException('Lead not found', HttpStatus.NOT_FOUND);

    // If the entity supports soft delete (has @DeleteDateColumn), softRemove works.
    // If not, we might need remove. Usually Lead entities have soft delete.
    // Let's assume they all do or fallback to remove if needed, but softRemove is safer.
    // Check if the entity has deletedAt equivalent. 
    // TypeORM softRemove checks metadata.

    await repo.remove(lead);
    return { message: 'Lead deleted successfully' };
  }

  async importLeads(file: Express.Multer.File, userId: string, email: string) {
    if (
      !file?.mimetype.includes('spreadsheetml') &&
      !file?.mimetype.includes('csv') &&
      !file?.mimetype.includes('text/plain') && // CSVs can be text/plain
      !file?.originalname.match(/\.(xlsx|csv)$/)
    ) {
      throw new HttpException('Invalid file. Please upload .xlsx or .csv', HttpStatus.BAD_REQUEST);
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const excelRepo = dataSource.getRepository(ExcelLead);

    let imported = 0;
    let skipped = 0;

    // Helper to find value case-insensitively with aliases
    const getValue = (row: any, aliases: string[]) => {
      const keys = Object.keys(row);
      for (const alias of aliases) {
        // Exact match first
        if (row[alias] !== undefined) return row[alias];
        // Case-insensitive match
        const foundKey = keys.find(k => k.trim().toLowerCase() === alias.toLowerCase());
        if (foundKey) return row[foundKey];
      }
      return null;
    };

    const nameAliases = ['name', 'full name', 'fullname', 'lead name', 'contact name', 'person', 'customer name'];
    const emailAliases = ['email', 'email address', 'mail', 'e-mail'];
    const phoneAliases = ['phone', 'phone number', 'phonenumber', 'mobile', 'mobile number', 'contact', 'contact number', 'cell', 'cell phone'];
    const extIdAliases = ['externalLeadId', 'external_lead_id', 'lead id', 'id'];
    const pageIdAliases = ['pageId', 'page_id', 'page'];

    for (const row of jsonData as any[]) {
      try {
        const name = getValue(row, nameAliases);
        const emailVal = getValue(row, emailAliases);
        const phone = getValue(row, phoneAliases);
        const extId = getValue(row, extIdAliases);
        const pageId = getValue(row, pageIdAliases);

        // Required fields check: at least phone or email or name must exist to be useful, usually phone is critical for this system
        if (!phone && !emailVal && !name) {
          skipped++;
          continue;
        }

        const lead = excelRepo.create();
        lead.externalLeadId = extId ? String(extId) : `excel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        lead.name = name ? String(name) : undefined;
        lead.email = emailVal ? String(emailVal) : undefined;
        lead.phone = phone ? String(phone) : undefined;
        lead.pageId = pageId ? String(pageId) : undefined;
        lead.rawData = row;
        lead.createdBy = userId;
        lead.source = 'excel_import';

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
    };
  }

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

  async generateReport(leadId: number, userId: string, email: string) {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    const { lead: leadRepo } = this.getRepos(dataSource);

    const lead = await leadRepo.findOne({
      where: { id: leadId, createdBy: userId },
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

  async findLeadById(tenantKey: string, leadId: number, source: string) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);

    // Route to the correct entity based on source
    switch (source) {
      case 'meta':
        return ds.getRepository(MetaLead).findOne({ where: { id: leadId } });
      case 'google_ads':
        return ds.getRepository(GoogleAdsLead).findOne({ where: { id: leadId } });
      case 'google_form':
        return ds.getRepository(GoogleFormLead).findOne({ where: { id: leadId } });
      case 'manual':
      case 'excel_import':
      default:
        return ds.getRepository(Lead).findOne({ where: { id: leadId, source } });
    }
  }

  async findLeadByPhone(tenantKey: string, phone: string) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    return ds.getRepository(Lead).findOne({ where: { phone } });
  }

  async handleIncomingMessage(
    tenantKey: string,
    lead: any,
    content: string,
    whatsappMessageId?: string,
    parentMessageId?: number,
  ) {
    const conv = await this.conversationService.findByLead(tenantKey, lead.id, lead.source);
    let convId = conv?.id;
    if (!conv) {
      const dto: CreateConversationDto = {
        lead_id: lead.id,
        source: lead.source,
        phone_number: lead.phone,
        lead_name: lead.name,
      };
      convId = (await this.conversationService.create(tenantKey, dto, 'system', 'system')).data.id;
    }

    const msgDto: CreateMessageDto = {
      conversation_id: convId!,
      content,
      type: 'text',
      parent_message_id: parentMessageId,
    };

    return this.messageService.create(tenantKey, msgDto, '', '', whatsappMessageId);
  }
}
