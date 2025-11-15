// src/lead-assignment/agent-assignment.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DatabaseManager } from 'src/common/database/database.manager';
import { Lead } from 'src/lead_management/leads/entities/lead.entity';
import { MetaLead } from 'src/lead_management/facebook/entities/facebook.entity';
import { GoogleAdsLead } from 'src/lead_management/google-ads/entities/google-ad.entity';
import { GoogleFormLead } from 'src/lead_management/google-form/entities/google-form.entity';
import { ExcelLead } from 'src/lead_management/leads/entities/excel-lead.entity';
import { BusinessUser } from 'src/business-user/entities/business-user.entity';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { AgentAssignment } from './entities/agent-assignment.entity';
import { CreateAgentAssignmentDto } from './dto/create-agent-assignment.dto';

@Injectable()
export class AgentAssignmentService {
  constructor(private dbManager: DatabaseManager) {}

  private async getRepos(dataSource: DataSource) {
    return {
      assignment: dataSource.getRepository(AgentAssignment),
      businessUser: dataSource.getRepository(BusinessUser),
      conversation: dataSource.getRepository(Conversation),
      manualLead: dataSource.getRepository(Lead),
      metaLead: dataSource.getRepository(MetaLead),
      googleAdsLead: dataSource.getRepository(GoogleAdsLead),
      googleFormLead: dataSource.getRepository(GoogleFormLead),
      excelLead: dataSource.getRepository(ExcelLead),
    };
  }

  private async findLeadInAnySource(
    dataSource: DataSource,
    leadId: number,
    source: string,
  ): Promise<any | null> {
    const repos: Record<string, any> = {
      manual: dataSource.getRepository(Lead),
      meta: dataSource.getRepository(MetaLead),
      google_ads: dataSource.getRepository(GoogleAdsLead),
      google_form: dataSource.getRepository(GoogleFormLead),
      excel_import: dataSource.getRepository(ExcelLead),
    };

    const repo = repos[source];
    if (!repo) return null;

    return repo.findOne({ where: { id: leadId } });
  }

  /**
   * Create agent assignment + AUTO-CREATE CONVERSATION if not exists
   */
  async create(
    tenantKey: string,
    dto: CreateAgentAssignmentDto,
    userId: string,
    email: string,
  ) {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const {
      assignment: assignRepo,
      businessUser: userRepo,
      conversation: convRepo,
    } = await this.getRepos(dataSource);

    // ── Validate Agent ──
    const agent = await userRepo.findOne({ where: { id: dto.assigned_agent_id } });
    if (!agent) throw new NotFoundException('Agent not found');

    // ── Validate Lead Exists ──
    const lead = await this.findLeadInAnySource(dataSource, dto.lead_id, dto.source);
    if (!lead) throw new NotFoundException('Lead not found');

    // ── Save Assignment ──
    const assignment = assignRepo.create({
      leadSource: dto.source,
      leadId: dto.lead_id,
      assigned_agent_id: dto.assigned_agent_id,
      assigned_by: userId,
    });

    const saved = await assignRepo.save(assignment);

    // ── AUTO-CREATE CONVERSATION IF NOT EXISTS ──
    let conversation = await convRepo.findOne({
      where: { lead_id: dto.lead_id, source: dto.source },
    });

    if (!conversation) {
      conversation = convRepo.create({
        lead_id: dto.lead_id,
        source: dto.source,
        phone_number: lead.phone,
        lead_name: lead.name,
        createdBy: email,
        assigned_agent_id: dto.assigned_agent_id,
        status: 'open',
        updated_at: new Date(),
      });
      await convRepo.save(conversation);
    } else {
      // Update existing conversation
      await convRepo.update(
        { lead_id: dto.lead_id, source: dto.source },
        { assigned_agent_id: dto.assigned_agent_id, updated_at: new Date() },
      );
    }

    return { success: true, data: saved };
  }

  /**
   * Find current assignment for a lead
   */
  async findByLead(tenantKey: string, leadId: number, source: string): Promise<AgentAssignment | null> {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = dataSource.getRepository(AgentAssignment);
    return repo.findOne({ where: { leadId, leadSource: source } });
  }

  /**
   * Get assignment history
   */
  async getHistory(tenantKey: string, leadId: number, source: string): Promise<AgentAssignment[]> {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = dataSource.getRepository(AgentAssignment);
    return repo.find({
      where: { leadId, leadSource: source },
      order: { created_at: 'DESC' },
    });
  }
}