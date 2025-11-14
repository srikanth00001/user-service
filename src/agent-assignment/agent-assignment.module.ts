import { Module } from '@nestjs/common';
import { AgentAssignmentService } from './agent-assignment.service';
import { AgentAssignmentController } from './agent-assignment.controller';
import { DatabaseManager } from 'src/common/database/database.manager';

@Module({
  controllers: [AgentAssignmentController],
  providers: [AgentAssignmentService,DatabaseManager],
  exports: [AgentAssignmentService]
})
export class AgentAssignmentModule {}
