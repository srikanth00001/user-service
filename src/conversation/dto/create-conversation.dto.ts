import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  @IsInt()
  lead_id: number;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  assigned_agent_id?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsString()
  lead_name?: string;

  @IsOptional()
  @IsString()
  business_phone_number_id?: string;

  @IsOptional()
  @IsString()
  business_display_phone_number?: string;
}
