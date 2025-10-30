import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, IsDate, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateSubscriptionDto {
  @IsInt()
  @IsNotEmpty()
  plan_id: number;

  @IsString()
@IsNotEmpty()
user_id: string;


  @IsString()
  @IsNotEmpty()
  payment_mode: string;

  @IsDate()
  @IsNotEmpty()
  @Type(() => Date) 
  start_date: Date;

  @IsDate()
  @IsNotEmpty()
  @Type(() => Date) 
  expiry_date: Date;

  @IsOptional()
  @IsString()
  reference_id?: string;

  @IsOptional()
@IsString()
created_by?: string;

@IsOptional()
@IsString()
updated_by?: string;

@IsOptional()
@IsBoolean()
  active?:boolean;
}
