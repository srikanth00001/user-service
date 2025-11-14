// src/lead-assignment/lead-assignment.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DatabaseManager } from 'src/common/database/database.manager';
import { Lead } from 'src/lead_management/leads/entities/lead.entity';
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
      lead: dataSource.getRepository(Lead),
      businessUser: dataSource.getRepository(BusinessUser),
      conversation: dataSource.getRepository(Conversation),
    };
  }

  async create(tenantKey: string, dto: CreateAgentAssignmentDto, userId: string, email: string) {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const { assignment: assignRepo, lead: leadRepo, businessUser: userRepo, conversation: convRepo } = await this.getRepos(dataSource);

    const lead = await leadRepo.findOne({ where: { id: dto.lead_id } });
    if (!lead) throw new NotFoundException('Lead not found');

    const agent = await userRepo.findOne({ where: { id: dto.assigned_agent_id } });
    if (!agent) throw new NotFoundException('Agent not found');

    const assigner = await userRepo.findOne({ where: { id: userId } });
    if (!assigner) throw new NotFoundException('Assigner not found');

    const assignment = assignRepo.create({
      lead_id: dto.lead_id,
      assigned_agent_id: dto.assigned_agent_id,
      assigned_by: userId,
    });
    const saved = await assignRepo.save(assignment);

    // Sync all conversations for this lead
    await convRepo.update(
      { lead_id: dto.lead_id },
      { assigned_agent_id: dto.assigned_agent_id }
    );

    return { success: true, data: saved };
  }

  async findByLead(tenantKey: string, leadId: number): Promise<AgentAssignment | null> {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = dataSource.getRepository(AgentAssignment);
    return repo.findOne({ where: { lead_id: leadId } });
  }

  async getHistory(tenantKey: string, leadId: number): Promise<AgentAssignment[]> {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const repo = dataSource.getRepository(AgentAssignment);
    return repo.find({ where: { lead_id: leadId }, order: { created_at: 'DESC' } });
  }
}