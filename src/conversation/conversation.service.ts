import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { DataSource, FindOptionsWhere } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { DatabaseManager } from 'src/common/database/database.manager';
import { BusinessUser } from 'src/business-user/entities/business-user.entity';
import { Message } from 'src/message/entities/message.entity';
import { LeadsService } from 'src/lead_management/leads/leads.service';
import { AgentAssignmentService } from 'src/agent-assignment/agent-assignment.service';

export interface ConversationWithExtras extends Conversation {
  lastMessage?: Message | null;
  assignedAgent?: BusinessUser | null;
}

@Injectable()
export class ConversationService {
  constructor(
    private dbManager: DatabaseManager,
     @Inject(forwardRef(() => LeadsService))
    private leadsService: LeadsService,
    private AgentAssignmentService: AgentAssignmentService,
  ) {}

  private async getRepos(dataSource: DataSource) {
    return {
      conversation: dataSource.getRepository(Conversation),
      message: dataSource.getRepository(Message),
      businessUser: dataSource.getRepository(BusinessUser),
    };
  }

  private async getDataSourceForUser(userId: string, email: string): Promise<DataSource> {
    const { dataSource } = await this.dbManager.getConnectionForUser({ id: userId, email });
    return dataSource;
  }

  async create(
  tenantKey: string,
  dto: CreateConversationDto,
  userId: string,
  email: string
): Promise<{ success: boolean; data: ConversationWithExtras }> {
  const dataSource = await this.getDataSourceForUser(userId, email);
  const { conversation: convRepo, businessUser: userRepo } = await this.getRepos(dataSource);

  const lead = await this.leadsService.findLeadById(tenantKey, dto.lead_id, dto.source || 'manual');
  if (!lead) throw new NotFoundException('Lead not found');

  // Get assigned agent from LeadAssignment
  const AgentAssignment = await this.AgentAssignmentService?.findByLead(tenantKey, dto.lead_id);
  const assignedAgentId = AgentAssignment?.assigned_agent_id;

  const conv = convRepo.create({
    ...dto,
    phone_number: lead.phone,
    lead_name: lead.name,
    createdBy: email,
    assigned_agent_id: assignedAgentId || undefined, // ← Set here
  });

  const saved = await convRepo.save(conv);

  let assignedAgent: BusinessUser | null = null;
  if (assignedAgentId) {
    assignedAgent = await userRepo.findOne({ where: { id: assignedAgentId } });
  }

  const result: ConversationWithExtras = {
    ...saved,
    assignedAgent: assignedAgent || null,
    lastMessage: null,
  };

  return { success: true, data: result };
}

  async findAll(tenantKey: string, userId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, message: msgRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const convs = await convRepo.find({ order: { updated_at: 'DESC' } });
    const enriched: ConversationWithExtras[] = [];

    for (const conv of convs) {
      const enrichedConv: ConversationWithExtras = { ...conv };
      enrichedConv.assignedAgent = conv.assigned_agent_id
        ? await userRepo.findOne({ where: { id: conv.assigned_agent_id } }) || null
        : null;

      const lastMsg = await msgRepo.findOne({
        where: { conversation_id: conv.id, deleted_for_everyone: false },
        order: { created_at: 'DESC' },
      });
      enrichedConv.lastMessage = lastMsg || null;
      enriched.push(enrichedConv);
    }

    return { success: true, data: enriched };
  }

  async findOne(tenantKey: string, id: number, userId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const conv = await convRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found');

    conv['assignedAgent'] = conv.assigned_agent_id
      ? await userRepo.findOne({ where: { id: conv.assigned_agent_id } }) || null
      : null;

    return { success: true, data: conv };
  }

  async update(tenantKey: string, id: number, dto: UpdateConversationDto, userId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    if (dto.assigned_agent_id) {
      const agent = await userRepo.findOne({ where: { id: dto.assigned_agent_id } });
      if (!agent) throw new NotFoundException('Assigned agent not found');
    }

    const result = await convRepo.update(id, dto);
    if (result.affected === 0) throw new NotFoundException('Conversation not found');

    const updated = await convRepo.findOne({ where: { id } });
    if (!updated) throw new NotFoundException('Conversation not found');

    updated['assignedAgent'] = updated.assigned_agent_id
      ? await userRepo.findOne({ where: { id: updated.assigned_agent_id } }) || null
      : null;

    return { success: true, data: updated };
  }

  async remove(tenantKey: string, id: number, userId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo } = await this.getRepos(dataSource);

    const conv = await convRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found');

    await convRepo.softRemove(conv);
    return { success: true, message: 'Conversation deleted' };
  }

  async findByAssignedAgent(tenantKey: string, agentId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(agentId, email);
    const { conversation: convRepo, message: msgRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const convs = await convRepo.find({ where: { assigned_agent_id: agentId } });
    for (const conv of convs) {
      conv['assignedAgent'] = conv.assigned_agent_id
        ? await userRepo.findOne({ where: { id: conv.assigned_agent_id } }) || null
        : null;

      const lastMsg = await msgRepo.findOne({ where: { conversation_id: conv.id }, order: { created_at: 'DESC' } });
      conv['lastMessage'] = lastMsg || null;
    }

    return { success: true, data: convs };
  }

  async filterByStatus(tenantKey: string, status: 'open' | 'closed' | 'pending', userId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, message: msgRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const convs = await convRepo.find({ where: { status } as FindOptionsWhere<Conversation> });
    for (const conv of convs) {
      conv['assignedAgent'] = conv.assigned_agent_id
        ? await userRepo.findOne({ where: { id: conv.assigned_agent_id } }) || null
        : null;

      const lastMsg = await msgRepo.findOne({ where: { conversation_id: conv.id }, order: { created_at: 'DESC' } });
      conv['lastMessage'] = lastMsg || null;
    }

    return { success: true, data: convs };
  }

  async getUnreadCount(tenantKey: string, userId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, message: msgRepo } = await this.getRepos(dataSource);

    const convs = await convRepo.find({ where: { assigned_agent_id: userId } });
    const counts = await Promise.all(
      convs.map(async (conv) => {
        const unread = await msgRepo.count({ where: { conversation_id: conv.id, isRead: false } });
        return { conversationId: conv.id, unreadCount: unread };
      }),
    );

    return { success: true, data: counts };
  }

  async search(tenantKey: string, query: string, userId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, message: msgRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const convs = await convRepo.createQueryBuilder('conv')
      .where('conv.lead_name ILIKE :query OR conv.phone ILIKE :query', { query: `%${query}%` })
      .getMany();

    for (const conv of convs) {
      conv['assignedAgent'] = conv.assigned_agent_id
        ? await userRepo.findOne({ where: { id: conv.assigned_agent_id } }) || null
        : null;

      const lastMsg = await msgRepo.findOne({ where: { conversation_id: conv.id }, order: { created_at: 'DESC' } });
      conv['lastMessage'] = lastMsg || null;
    }

    return { success: true, data: convs };
  }

  async advancedFilter(
    tenantKey: string,
    filters: { priority?: string; department?: string; topic?: string; channel?: string; sentiment?: string },
    userId: string,
    email: string
  ) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    let query = convRepo.createQueryBuilder('conv');
    if (filters.priority) query = query.andWhere('conv.priority = :priority', { priority: filters.priority });
    if (filters.department) query = query.andWhere('conv.department = :department', { department: filters.department });
    if (filters.topic) query = query.andWhere('conv.topic = :topic', { topic: filters.topic });
    if (filters.channel) query = query.andWhere('conv.channel = :channel', { channel: filters.channel });
    if (filters.sentiment) query = query.andWhere('conv.sentiment = :sentiment', { sentiment: filters.sentiment });

    const convs = await query.getMany();

    for (const conv of convs) {
      conv['assignedAgent'] = conv.assigned_agent_id
        ? await userRepo.findOne({ where: { id: conv.assigned_agent_id } }) || null
        : null;
    }

    return { success: true, data: convs };
  }

  async findByLead(tenantKey: string, leadId: number, source: string) {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const { conversation: convRepo } = await this.getRepos(dataSource);

    return await convRepo.findOne({ where: { lead_id: leadId, source } });
  }
}
