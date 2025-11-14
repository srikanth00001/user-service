// src/lead-assignment/dto/create-lead-assignment.dto.ts
import { IsInt, IsString } from 'class-validator';

export class CreateAgentAssignmentDto {
  @IsInt()
  lead_id: number;

  @IsString()
  assigned_agent_id: string;
}