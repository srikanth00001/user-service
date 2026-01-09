import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LeadCreatedEvent } from './events/lead-created.event';

@Injectable()
export class LeadsListener {
    private readonly logger = new Logger(LeadsListener.name);

    constructor(
    ) { }

    @OnEvent('lead.created')
    async handleAutoAssignment(event: LeadCreatedEvent) {
        this.logger.log(`[EDA] Lead Created Event received for lead: ${event.lead.id} (Source: ${event.source})`);

        // Future: Call AgentAssignmentService.assignAgentToLead
        // await this.agentAssignmentService.assignAgentToLead(event.tenantKey, event.lead.id);
    }
}
