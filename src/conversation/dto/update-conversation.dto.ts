import { IsOptional, IsString, IsDateString } from 'class-validator';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  assigned_agent_id?: string;

  @IsOptional()
  @IsDateString()
  scheduled_at?: string;
}