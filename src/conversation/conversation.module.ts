import { Module, forwardRef } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { DatabaseManager } from 'src/common/database/database.manager';
import { LeadsModule } from 'src/lead_management/leads/leads.module';
import { AgentAssignmentModule } from 'src/agent-assignment/agent-assignment.module';

@Module({
  imports: [forwardRef(() => LeadsModule),AgentAssignmentModule], // ← Use forwardRef to prevent circular dependency
  controllers: [ConversationController],
  providers: [ConversationService, DatabaseManager],
  exports: [ConversationService],
})
export class ConversationModule {}
