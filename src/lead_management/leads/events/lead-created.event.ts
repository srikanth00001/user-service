import { Lead } from '../entities/lead.entity';

export class LeadCreatedEvent {
    constructor(
        public readonly tenantKey: string,
        public readonly lead: Lead,
        public readonly source: string,
    ) { }
}
