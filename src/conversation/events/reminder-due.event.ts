export class ReminderDueEvent {
    constructor(
        public readonly tenantKey: string,
        public readonly recipientEmail: string,
        public readonly recipientName: string,
        public readonly leadName: string,
        public readonly phone: string,
        public readonly conversationId: number,
        public readonly scheduledAt: Date,
        public readonly email: string | undefined, // optional lead email
    ) { }
}
