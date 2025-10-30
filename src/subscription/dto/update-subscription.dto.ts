import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsDate, IsNumber, IsBoolean } from 'class-validator';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsInt()
  plan_id?: number;

  @IsOptional()
  @IsString() // Changed from IsInt to IsString
  user_id?: string;

  @IsOptional()
  @IsString()
  payment_mode?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date) 
  start_date?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date) 
  expiry_date?: Date;

   @IsOptional()
  @IsString()
  reference_id?: string;

  @IsOptional()
  @IsString() // Changed to string to match entity
  updated_by?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}