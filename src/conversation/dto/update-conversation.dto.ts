import { IsOptional, IsString } from 'class-validator';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  assigned_agent_id?: string;
}