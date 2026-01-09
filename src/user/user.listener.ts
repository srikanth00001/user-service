import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserRegisteredEvent } from './events/user-registered.event';
import { UserService } from './user.service';

@Injectable()
export class UserListener {
    private readonly logger = new Logger(UserListener.name);

    constructor(
        private readonly userService: UserService,
    ) { }

    @OnEvent('user.registered')
    async handleTenantSeeding(event: UserRegisteredEvent) {
        if (event.tenantKey && event.user.email) {
            this.logger.log(`[EDA] Seeding tenant for new user: ${event.user.email} (Tenant: ${event.tenantKey})`);
            try {
                await this.userService.seedBusinessTenant({
                    tenantKey: event.tenantKey,
                    ownerEmail: event.user.email
                });
                this.logger.log(`✅ [EDA] Tenant seeded successfully for ${event.tenantKey}`);
            } catch (error) {
                this.logger.error(`❌ [EDA] Failed to seed tenant for ${event.tenantKey}:`, error);
            }
        }
    }
}
