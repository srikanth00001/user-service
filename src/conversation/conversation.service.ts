import { Injectable, NotFoundException, Inject, forwardRef, ConflictException } from '@nestjs/common';
import { DataSource, FindOptionsWhere } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { DatabaseManager } from 'src/common/database/database.manager';
import { BusinessUser } from 'src/business-user/entities/business-user.entity';
import { Message } from 'src/message/entities/message.entity';
import { LeadsService } from 'src/lead_management/leads/leads.service';
import { AgentAssignmentService } from 'src/agent-assignment/agent-assignment.service';
import { MetaConnection } from 'src/lead_management/facebook/entities/meta-connection.entity';

// Extended interface for frontend needs
export interface ConversationListItem extends Conversation {
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  assignedAgent?: BusinessUser | null;
  lastMessage?: Message | null;
}

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
    private agentAssignmentService: AgentAssignmentService,
  ) { }

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

  async getTenantKey(conversationId: number): Promise<{ tenantKey: string } | null> {
    for (const { dataSource, name: tenantKey } of this.dbManager['connections'].values()) {
      const convRepo = dataSource.getRepository(Conversation);
      const conv = await convRepo.findOne({ where: { id: conversationId }, select: ['id'] });
      if (conv) return { tenantKey };
    }
    return null;
  }

  async create(
    tenantKey: string,
    dto: CreateConversationDto,
    userId: string,
    email: string,
  ): Promise<{ success: boolean; data: ConversationWithExtras }> {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const { conversation: convRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    // ── Check for Existing Conversation ──
    const existingConv = await this.findByLead(tenantKey, dto.lead_id, dto.source || 'manual');
    if (existingConv) {
      let errorMessage = 'A conversation already exists for this lead';
      if (existingConv.assigned_agent_id) {
        const agent = await userRepo.findOne({ where: { id: existingConv.assigned_agent_id } });
        if (agent) {
          const agentName = `${agent.firstName} ${agent.lastName || ''}`.trim();
          errorMessage = `Lead already has a conversation assigned to ${agentName}`;
        }
      }
      throw new ConflictException(errorMessage);
    }

    const lead = await this.leadsService.findLeadById(tenantKey, dto.lead_id, dto.source || 'manual');
    if (!lead) throw new NotFoundException('Lead not found');

    const assignment = await this.agentAssignmentService.findByLead(tenantKey, dto.lead_id, dto.source || 'manual');
    const assignedAgentId = assignment?.assigned_agent_id;

    const metaRepo = dataSource.getRepository(MetaConnection);
    let connection: MetaConnection | null = null;
    if (dto.business_phone_number_id) {
      connection = await metaRepo.findOne({ where: { tenantKey, phoneNumberId: dto.business_phone_number_id } });
    }

    const conv = convRepo.create();
    Object.assign(conv, {
      lead_id: dto.lead_id,
      source: dto.source || 'manual',
      phone_number: lead.phone,
      lead_name: lead.name,
      createdBy: userId,
      assigned_agent_id: assignedAgentId || undefined,
      business_phone_number_id: dto.business_phone_number_id || null,
      business_display_phone_number: dto.business_display_phone_number || connection?.displayPhoneNumber || null,
      channel: 'whatsapp',
      initiated_by: (dto as any).initiated_by || 'tenant',
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

  async findAll(tenantKey: string, userId: string, email: string, role?: any): Promise<{ success: boolean; data: ConversationListItem[] }> {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, message: msgRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    // Determine Role
    const roleName = String(typeof role === 'object' ? role?.name : role || '').toLowerCase();

    // 1. Privileged: Can see EVERYTHING
    // 1. Privileged: Can see EVERYTHING (Owners/Managers/Admins)
    // Note: 'business' role is NOT completely privileged - they should see assigned OR unassigned customer-initiated
    const isPrivileged = ['owner', 'manager', 'admin'].some((r) => roleName.includes(r));

    // 2. Staff/Agent: Can see ASSIGNED ONLY
    const isStaff = ['staff', 'agent'].some((r) => roleName.includes(r));

    const query = convRepo.createQueryBuilder('conv')
      .leftJoinAndSelect(
        '(SELECT DISTINCT ON ("conversation_id") * FROM messages WHERE deleted_for_everyone = false ORDER BY "conversation_id", created_at DESC)',
        'last_msg',
        'last_msg.conversation_id = conv.id'
      )
      .select([
        'conv.*',
        'last_msg.content AS last_message_content',
        'last_msg.created_at AS last_message_at',
      ])
      .orderBy('last_message_at', 'DESC', 'NULLS LAST')  // Most recent message first
      .addOrderBy('conv.updated_at', 'DESC');            // Fallback: recently updated

    // ── Filter Logic ──
    if (isPrivileged) {
      // Owners/Managers see ALL
    } else if (isStaff) {
      // Staff Agents see ONLY conversations assigned to them
      query.andWhere('conv.assigned_agent_id = :userId', { userId });
    } else {
      // Business/Personal Users (everyone else)
      // 1. See conversations assigned to them (if any)
      // 2. See conversations they created (outbound)
      // 3. See conversations initiated by CUSTOMER that are UNASSIGNED (start of new chat)
      // 4. See conversations initiated by CUSTOMER that are assigned to THEM
      query.andWhere(
        '(conv.assigned_agent_id = :userId OR conv.createdBy = :userId OR (conv.initiated_by = :custInit AND conv.assigned_agent_id IS NULL))',
        { userId, custInit: 'customer' }
      );
    }

    const conversationsWithLastMessage = await query.getRawMany();

    const enriched: ConversationListItem[] = [];

    for (const row of conversationsWithLastMessage) {
      const conv = row as any;

      // Count unread messages (only incoming/customer messages if needed)
      const unreadCount = await msgRepo.count({
        where: {
          conversation_id: conv.id,
          isRead: false,
          // Optional: only count customer messages
          // sender_user_id: IsNull(),
        },
      });

      let assignedAgent: BusinessUser | null = null;
      if (conv.assigned_agent_id) {
        assignedAgent = await userRepo.findOne({ where: { id: conv.assigned_agent_id } });
      }

      enriched.push({
        id: conv.id,
        lead_id: conv.lead_id,
        source: conv.source,
        phone_number: conv.phone_number,
        business_phone_number_id: conv.business_phone_number_id,
        business_display_phone_number: conv.business_display_phone_number,
        lead_name: conv.lead_name,
        assigned_agent_id: conv.assigned_agent_id,
        status: conv.status,
        active: conv.active,
        priority: conv.priority,
        department: conv.department,
        topic: conv.topic,
        channel: conv.channel,
        sentiment: conv.sentiment,
        initiated_by: conv.initiated_by || 'tenant',
        createdBy: conv.createdBy,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        deleted_at: conv.deleted_at,
        scheduled_at: conv.scheduled_at,
        reminder_sent: conv.reminder_sent,

        // From subquery
        last_message: conv.last_message_content?.trim() || null,
        last_message_at: conv.last_message_at || null,
        unread_count: unreadCount,
        assignedAgent: assignedAgent || null,
      });
    }

    return { success: true, data: enriched };
  }

  async findByPhone(
    tenantKey: string,
    phone: string,
    userId: string,
    email: string,
  ): Promise<{ success: boolean; data: Conversation | null }> {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo } = await this.getRepos(dataSource);
    const conv = await convRepo.findOne({ where: { phone_number: phone } });
    return { success: true, data: conv || null };
  }

  async findOne(tenantKey: string, id: number, userId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const conv = await convRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found');

    let assignedAgent: BusinessUser | null = null;
    if (conv.assigned_agent_id) {
      assignedAgent = await userRepo.findOne({ where: { id: conv.assigned_agent_id } });
    }

    (conv as any).assignedAgent = assignedAgent;

    return { success: true, data: conv };
  }

  async update(
    tenantKey: string,
    id: number,
    dto: UpdateConversationDto,
    userId: string,
    email: string,
  ) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    if (dto.assigned_agent_id) {
      const agent = await userRepo.findOne({ where: { id: dto.assigned_agent_id } });
      if (!agent) throw new NotFoundException('Assigned agent not found');
    }

    // Prepare update data
    const updateData: any = {};
    if (dto.assigned_agent_id !== undefined) {
      updateData.assigned_agent_id = dto.assigned_agent_id;
    }
    if (dto.scheduled_at !== undefined) {
      // If scheduled_at is provided, parse it and reset reminder_sent
      updateData.scheduled_at = dto.scheduled_at ? new Date(dto.scheduled_at) : null;
      updateData.reminder_sent = false; // Reset reminder when schedule is updated
    }

    const result = await convRepo.update(id, updateData);
    if (result.affected === 0) throw new NotFoundException('Conversation not found');

    const updated = await convRepo.findOne({ where: { id } });
    if (!updated) throw new NotFoundException('Conversation not found');

    let assignedAgent: BusinessUser | null = null;
    if (updated.assigned_agent_id) {
      assignedAgent = await userRepo.findOne({ where: { id: updated.assigned_agent_id } });
    }

    (updated as any).assignedAgent = assignedAgent;

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
      const assignedAgent: BusinessUser | null = conv.assigned_agent_id
        ? await userRepo.findOne({ where: { id: conv.assigned_agent_id } })
        : null;

      const lastMsg = await msgRepo.findOne({
        where: { conversation_id: conv.id, deleted_for_everyone: false },
        order: { created_at: 'DESC' },
      });

      (conv as any).assignedAgent = assignedAgent;
      (conv as any).lastMessage = lastMsg || null;
    }

    return { success: true, data: convs };
  }

  async filterByStatus(
    tenantKey: string,
    status: 'open' | 'closed' | 'pending',
    userId: string,
    email: string,
  ) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, message: msgRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const convs = await convRepo.find({ where: { status } as FindOptionsWhere<Conversation> });

    for (const conv of convs) {
      const assignedAgent: BusinessUser | null = conv.assigned_agent_id
        ? await userRepo.findOne({ where: { id: conv.assigned_agent_id } })
        : null;

      const lastMsg = await msgRepo.findOne({
        where: { conversation_id: conv.id, deleted_for_everyone: false },
        order: { created_at: 'DESC' },
      });

      (conv as any).assignedAgent = assignedAgent;
      (conv as any).lastMessage = lastMsg || null;
    }

    return { success: true, data: convs };
  }

  async getUnreadCount(tenantKey: string, userId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, message: msgRepo } = await this.getRepos(dataSource);

    const convs = await convRepo.find({ where: { assigned_agent_id: userId } });
    const counts = await Promise.all(
      convs.map(async (conv) => {
        const unread = await msgRepo.count({
          where: { conversation_id: conv.id, isRead: false },
        });
        return { conversationId: conv.id, unreadCount: unread };
      }),
    );

    return { success: true, data: counts };
  }

  async search(tenantKey: string, query: string, userId: string, email: string) {
    const dataSource = await this.getDataSourceForUser(userId, email);
    const { conversation: convRepo, message: msgRepo, businessUser: userRepo } = await this.getRepos(dataSource);

    const convs = await convRepo
      .createQueryBuilder('conv')
      .where('conv.lead_name ILIKE :query OR conv.phone_number ILIKE :query', { query: `%${query}%` })
      .getMany();

    for (const conv of convs) {
      const assignedAgent: BusinessUser | null = conv.assigned_agent_id
        ? await userRepo.findOne({ where: { id: conv.assigned_agent_id } })
        : null;

      const lastMsg = await msgRepo.findOne({
        where: { conversation_id: conv.id, deleted_for_everyone: false },
        order: { created_at: 'DESC' },
      });

      (conv as any).assignedAgent = assignedAgent;
      (conv as any).lastMessage = lastMsg || null;
    }

    return { success: true, data: convs };
  }

  async advancedFilter(
    tenantKey: string,
    filters: { priority?: string; department?: string; topic?: string; channel?: string; sentiment?: string },
    userId: string,
    email: string,
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
      const assignedAgent: BusinessUser | null = conv.assigned_agent_id
        ? await userRepo.findOne({ where: { id: conv.assigned_agent_id } })
        : null;

      (conv as any).assignedAgent = assignedAgent;
    }

    return { success: true, data: convs };
  }

  async findByLead(tenantKey: string, leadId: number, source: string) {
    const dataSource = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    const { conversation: convRepo } = await this.getRepos(dataSource);
    return convRepo.findOne({ where: { lead_id: leadId, source } });
  }
}
