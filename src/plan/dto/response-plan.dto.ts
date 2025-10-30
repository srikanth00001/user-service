import { Plan } from '../entities/plan.entity';
import * as moment from 'moment-timezone'; // Correct import

export class PlanResponseDto {
  id: number;
  name: string;
  description: string;
  period: number; // Duration in days
  amount: number;
  offer_type: string | null; // "percentage" | "amount" | null
  offer_value: number | null;
  offer_start_date: string | null;
  offer_end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  active: boolean;

  constructor(plan: Plan) {
    this.id = plan.id;
    this.name = plan.name;
    this.description = plan.description;
    this.period = plan.period;
    this.amount = plan.amount;
    this.offer_type = plan.offer_type ?? null; // Ensures `null` if not provided
    this.offer_value = plan.offer_value ?? null;

    this.offer_start_date = plan.offer_start_date
      ? moment.utc(plan.offer_start_date).tz('Asia/Kolkata').format('DD-MM-YYYY HH:mm:ss')
      : null;

    this.offer_end_date = plan.offer_end_date
      ? moment.utc(plan.offer_end_date).tz('Asia/Kolkata').format('DD-MM-YYYY HH:mm:ss')
      : null;

    this.created_at = plan.created_at
      ? moment.utc(plan.created_at).tz('Asia/Kolkata').format('DD-MM-YYYY HH:mm:ss')
      : null;

    this.updated_at = plan.updated_at
      ? moment.utc(plan.updated_at).tz('Asia/Kolkata').format('DD-MM-YYYY HH:mm:ss')
      : null;

    this.active = plan.active;
  }

  static fromEntity(plan: Plan): PlanResponseDto {
    return new PlanResponseDto(plan);
  }

  static fromEntities(plans: Plan[]): PlanResponseDto[] {
    return plans.map((plan) => new PlanResponseDto(plan));
  }
}
