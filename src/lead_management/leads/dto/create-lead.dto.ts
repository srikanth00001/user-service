import { IsString, IsInt, IsOptional, Min, IsIn } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  facebookLeadId: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsInt()
  @Min(1)
  campaignId: number;

  @IsString()
  pageId: string;

  @IsString()
  @IsIn(['meta', 'google', 'google_ads']) // Restrict source values
  @IsOptional()
  source?: string;
  
}