import { IsString, IsNumber, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNumber()
  @Type(() => Number)
  period: number; // Duration in days

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  offer_type: string; // "percentage" | "amount"

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  offer_value: number;

 @IsOptional()
  @Type(() => Date)
  offer_start_date: Date;

  @IsOptional()
  @Type(() => Date)
  offer_end_date: Date;

  @IsBoolean()
  @Type(() => Boolean)
  active: boolean;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10)) 
  created_by?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  updated_by?: number;
}
