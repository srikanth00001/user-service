import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, DataSource, Not, IsNull } from 'typeorm';
import { Subscription } from 'src/subscription/entities/subscription.entity';
import axios from 'axios';
import { SubscriptionStatus } from '../subscription/entities/subscription.entity';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { Lead } from 'src/lead_management/leads/entities/lead.entity';
import { BusinessUser } from 'src/business-user/entities/business-user.entity';
import { User } from 'src/user/entities/user.entity';
import { EmailService } from 'src/common/email/email.service';
import { DatabaseManager, TenantConnection } from 'src/common/database/database.manager';

@Injectable()
export class CronJobsService {
  private readonly logger = new Logger(CronJobsService.name);

  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private emailService: EmailService,
    private dbManager: DatabaseManager,
  ) {
    // Log that cron jobs are initialized
    this.logger.log('✅ CronJobsService initialized - Conversation reminder cron will run every 5 minutes');
  }

  @Cron('50 15 * * *')


  async handleSubscriptionQueue() {
  this.logger.log('Running subscription queue check...');

  const now = new Date();

  // Find users whose ACTIVE subscription has expired
  const expiredActiveSubs = await this.subscriptionRepository.find({
    where: {
      status: SubscriptionStatus.ACTIVE,
      expiry_date: LessThanOrEqual(now),
    },
    relations: ['user'],
  });

  for (const expiredSub of expiredActiveSubs) {
    const userId = expiredSub.user.id;

    // Mark current as EXPIRED
    await this.subscriptionRepository.update(expiredSub.id, {
      status: SubscriptionStatus.EXPIRED,
      active: false,
    });

    this.logger.log(`Expired subscription ${expiredSub.id} for user ${userId}`);

    // Find the next UPCOMING subscription (earliest start_date)
    const nextSub = await this.subscriptionRepository.findOne({
      where: {
        user: { id: userId },
        status: SubscriptionStatus.UPCOMING,
      },
      order: { start_date: 'ASC' },
    });

    if (nextSub) {
      // Activate it!
      await this.subscriptionRepository.update(nextSub.id, {
        status: SubscriptionStatus.ACTIVE,
        active: true,
        start_date: now, // or keep original? usually reset to now
      });

      this.logger.log(`Activated upcoming subscription ${nextSub.id}`);

      await this.sendWebhook('SUBSCRIPTION_ACTIVATED', {
        subscription_id: nextSub.id,
        user_id: userId,
        plan_name: nextSub.plan.name,
      });

      await this.sendWebhook('SUBSCRIPTION_EXPIRED', {
        previous_subscription_id: expiredSub.id,
      });
    } else {
      await this.sendWebhook('SUBSCRIPTION_EXPIRED_NO_QUEUE', {
        user_id: userId,
      });
    }
  }
}
  async deactivateExpiredSubscriptions() {
    try {
      console.log('Checking for expired subscriptions...');
      const expiredSubscriptions = await this.subscriptionRepository.find({
        where: { expiry_date: LessThanOrEqual(new Date()), active: true },
      });

      if (expiredSubscriptions.length === 0) {
        console.log('No expired subscriptions found.');
        return;
      }

      await this.subscriptionRepository
        .createQueryBuilder()
        .update(Subscription)
        .set({ active: false })
        .where('expiry_date <= CURRENT_TIMESTAMP AND active = true')
        .execute();

      console.log(`Deactivated ${expiredSubscriptions.length} expired subscriptions.`);

      for (const sub of expiredSubscriptions) {
        await this.sendWebhook('SUBSCRIPTION_EXPIRED_BROADCAST_STOPPED', {
          subscription_id: sub.id,
          user_id: sub.user_id,
          plan_id: sub.plan_id,
          expiry_date: sub.expiry_date,
        });
      }
    } catch (error) {
      console.error('Error during subscription deactivation:', error);
    }
  }

  async sendWebhook(eventType: string, payload: any) {
  try {
    const webhookUrl = process.env.WEBHOOK_URL;

    if (!webhookUrl) {
      throw new Error('WEBHOOK_URL is not defined in environment variables.');
    }

    console.log(`Sending ${eventType} webhook to ${webhookUrl}`);
    console.log('Webhook Payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(webhookUrl, { event: eventType, data: payload });
    console.log(`Webhook sent successfully. Status: ${response.status}`);
  } catch (error) {
    console.error(`Webhook failed for ${eventType}:`, error.message);
  }
}

  // ─────────────────────────────────────────────────────────────────
  // CONVERSATION REMINDER CRON JOB
  // ─────────────────────────────────────────────────────────────────
  @Cron('*/5 * * * *') // Run every 5 minutes
  async checkConversationReminders() {
    this.logger.log('⏰ [CRON] Checking for due conversation reminders...');
    
    try {
      const now = new Date();
      this.logger.log(`Current time (UTC): ${now.toISOString()}`);
      
      // Get all tenant connections
      // Access the private connections map via type assertion
      const connections = Array.from((this.dbManager as any).connections.values()) as TenantConnection[];
      
      if (connections.length === 0) {
        this.logger.warn('⚠️ No tenant connections found. Cron job will check when connections are available.');
        return;
      }
      
      this.logger.log(`Found ${connections.length} tenant connection(s) to check`);
      
      for (const { dataSource, name: tenantKey } of connections) {
        try {
          this.logger.log(`Checking tenant: ${tenantKey}`);
          const convRepo = dataSource.getRepository(Conversation);
          const leadRepo = dataSource.getRepository(Lead);
          
          // Find conversations with scheduled_at <= now and reminder_sent = false
          // Using UTC time for comparison since scheduled_at is stored as timestamptz (UTC)
          const dueConversations = await convRepo.find({
            where: {
              scheduled_at: LessThanOrEqual(now),
              reminder_sent: false,
              active: true,
            },
          });
          
          this.logger.log(`Tenant ${tenantKey}: Found ${dueConversations.length} conversation(s) with scheduled reminders`);
          
          if (dueConversations.length === 0) {
            // Log all scheduled conversations for debugging
            const allScheduled = await convRepo.find({
              where: {
                scheduled_at: Not(IsNull()),
                reminder_sent: false,
                active: true,
              },
              select: ['id', 'scheduled_at', 'reminder_sent'],
            });
            if (allScheduled.length > 0) {
              this.logger.log(`Tenant ${tenantKey}: ${allScheduled.length} scheduled conversation(s) found, but none are due yet:`);
              allScheduled.forEach(c => {
                const scheduledTime = c.scheduled_at ? new Date(c.scheduled_at).toISOString() : 'null';
                const isDue = c.scheduled_at && new Date(c.scheduled_at) <= now;
                this.logger.log(`  - Conversation ${c.id}: scheduled_at=${scheduledTime}, now=${now.toISOString()}, isDue=${isDue}`);
              });
            }
            continue;
          }
          
          this.logger.log(`✅ Found ${dueConversations.length} due reminder(s) in tenant: ${tenantKey}`);
          
          for (const conv of dueConversations) {
            try {
              // Get lead details
              const lead = await leadRepo.findOne({ where: { id: conv.lead_id } });
              if (!lead) {
                this.logger.warn(`Lead not found for conversation ${conv.id}`);
                continue;
              }
              
              // Determine recipient
              let recipientEmail: string | null = null;
              let recipientName: string = 'User';
              
              // Priority: 1. Assigned agent, 2. Business owner (main DB)
              if (conv.assigned_agent_id) {
                // Get agent from tenant DB
                const agentRepo = dataSource.getRepository(BusinessUser);
                const agent = await agentRepo.findOne({ where: { id: conv.assigned_agent_id } });
                if (agent) {
                  recipientEmail = agent.email;
                  recipientName = `${agent.firstName} ${agent.lastName || ''}`.trim();
                }
              }
              
              // If no agent or agent not found, get business owner from main DB
              if (!recipientEmail) {
                const masterDs = this.dbManager.getMasterDataSource();
                const userRepo = masterDs.getRepository(User);
                // Use query builder to properly join and filter by role name
                const businessOwner = await userRepo
                  .createQueryBuilder('user')
                  .leftJoinAndSelect('user.role', 'role')
                  .where('user.tenantKey = :tenantKey', { tenantKey })
                  .andWhere('role.name = :roleName', { roleName: 'business' })
                  .getOne();
                if (businessOwner) {
                  recipientEmail = businessOwner.email;
                  recipientName = `${businessOwner.firstName} ${businessOwner.lastName || ''}`.trim();
                }
              }
              
              if (!recipientEmail) {
                this.logger.warn(`No recipient found for conversation ${conv.id}`);
                continue;
              }
              
              // Send reminder email
              this.logger.log(`Sending reminder email for conversation ${conv.id} to ${recipientEmail}...`);
              const emailSent = await this.emailService.sendReminderEmail(
                recipientEmail,
                recipientName,
                {
                  leadName: lead.name || conv.lead_name || 'Unknown',
                  phone: lead.phone || conv.phone_number || 'N/A',
                  email: lead.email || undefined,
                  scheduledAt: conv.scheduled_at!,
                  conversationId: conv.id,
                  tenantKey,
                },
              );
              
              if (emailSent) {
                // Mark reminder as sent
                await convRepo.update(conv.id, { reminder_sent: true });
                this.logger.log(`✅ Reminder sent successfully for conversation ${conv.id} to ${recipientEmail}`);
              } else {
                this.logger.error(`❌ Failed to send reminder email for conversation ${conv.id} to ${recipientEmail}`);
              }
            } catch (error) {
              this.logger.error(`❌ Error processing reminder for conversation ${conv.id}:`, error);
              this.logger.error(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
            }
          }
        } catch (error) {
          this.logger.error(`Error checking reminders for tenant ${tenantKey}:`, error);
        }
      }
    } catch (error) {
      this.logger.error('Error in checkConversationReminders:', error);
    }
  }

}
