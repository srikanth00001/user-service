// src/lead-assignment/dto/create-agent-assignment.dto.ts
import { IsIn, IsNumber, IsUUID } from 'class-validator';

export class CreateAgentAssignmentDto {
  @IsNumber()
  lead_id: number;

  @IsIn(['manual', 'meta', 'google_ads', 'google_form', 'excel_import'])
  source: string;

  @IsUUID()
  assigned_agent_id: string;
}