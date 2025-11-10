import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  facebookCampaignId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;
}