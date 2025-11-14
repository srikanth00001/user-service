import { PartialType } from '@nestjs/swagger';
import { CreateAgentAssignmentDto } from './create-agent-assignment.dto';

export class UpdateAgentAssignmentDto extends PartialType(CreateAgentAssignmentDto) {}
