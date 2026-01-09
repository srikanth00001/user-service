import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ReminderDueEvent } from './events/reminder-due.event';
import { EmailService } from '../common/email/email.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { Repository } from 'typeorm';
import { DatabaseManager } from '../common/database/database.manager';

@Injectable()
export class ConversationListener {
    private readonly logger = new Logger(ConversationListener.name);

    constructor(
        private readonly emailService: EmailService,
        private readonly dbManager: DatabaseManager,
    ) { }

    @OnEvent('conversation.reminder_due')
    async handleReminderEmail(event: ReminderDueEvent) {
        this.logger.log(`[EDA] Sending reminder email for conversation ${event.conversationId} to ${event.recipientEmail}`);

        const emailSent = await this.emailService.sendReminderEmail(
            event.recipientEmail,
            event.recipientName,
            {
                leadName: event.leadName,
                phone: event.phone,
                email: event.email,
                scheduledAt: event.scheduledAt,
                conversationId: event.conversationId,
                tenantKey: event.tenantKey,
            },
        );

        if (emailSent) {
            // Mark reminder as sent
            const ds = await this.dbManager.getOrCreateTenantConnection(event.tenantKey);
            const convRepo = ds.getRepository(Conversation);
            await convRepo.update(event.conversationId, { reminder_sent: true });
            this.logger.log(`✅ [EDA] Reminder sent & updated for conversation ${event.conversationId}`);
        } else {
            this.logger.error(`❌ [EDA] Failed to send reminder email for conversation ${event.conversationId}`);
        }
    }
}
