import { Module } from '@nestjs/common';
import { TeamInboxService } from './team-inbox.service';
import { TeamInboxController } from './team-inbox.controller';
import { DatabaseManager } from 'src/common/database/database.manager';
import { ConversationModule } from 'src/conversation/conversation.module';
import { MessageModule } from 'src/message/message.module';
import { AgentAssignmentModule } from 'src/agent-assignment/agent-assignment.module';
import { BusinessUserModule } from 'src/business-user/business-user.module';
import { LeadsModule } from 'src/lead_management/leads/leads.module';
import { WhatsAppModule } from 'src/whatsapp/whatsapp.module';
import { MessageGateway } from 'src/websocket/message.gateway';
import { AgentAssignmentService } from 'src/agent-assignment/agent-assignment.service';

@Module({
  imports: [
    ConversationModule,
    MessageModule,
    AgentAssignmentModule,
    BusinessUserModule,
    LeadsModule,
    WhatsAppModule,
  ],
  controllers: [TeamInboxController],
  providers: [TeamInboxService,DatabaseManager,MessageGateway,AgentAssignmentService],
  exports: [TeamInboxService]
})
export class TeamInboxModule {}
