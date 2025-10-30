import { Plan } from 'src/plan/entities/plan.entity';
import { User } from 'src/user/entities/user.entity';
import { Subscription } from '../entities/subscription.entity';
import moment from 'moment-timezone';

export class SubscriptionResponseDto {
  id: number;
  plan: Plan;
  user: Partial<User>;
  payment_mode: string;
  start_date: string;
  expiry_date: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  active: boolean;

  constructor(subscription: Subscription) {
    this.id = subscription.id;
    this.plan = subscription.plan;
    this.user = {
      id: subscription.user.id,
      firstName: subscription.user.firstName,
      lastName: subscription.user.lastName,
      email: subscription.user.email,
      mobileNumber: subscription.user.mobileNumber,
      address: subscription.user.address,
      city: subscription.user.city,
      state: subscription.user.state,
      country: subscription.user.country,
      active: subscription.user.active,
      isEmailVerified: subscription.user.isEmailVerified,
      createdAt: subscription.user.createdAt,
      lastLogin: subscription.user.lastLogin,
    };
    this.payment_mode = subscription.payment_mode;
    this.start_date = moment.utc(subscription.start_date).tz('Asia/Kolkata').format();
    this.expiry_date = moment.utc(subscription.expiry_date).tz('Asia/Kolkata').format();
    this.created_by = subscription.created_by;
    this.updated_by = subscription.updated_by;
    this.created_at = moment.utc(subscription.created_at).tz('Asia/Kolkata').format();
    this.updated_at = moment.utc(subscription.updated_at).tz('Asia/Kolkata').format();
    this.active = subscription.active;
  }

  static fromEntity(subscription: Subscription): SubscriptionResponseDto {
    return new SubscriptionResponseDto(subscription);
  }

  static fromEntities(subscriptions: Subscription[]): SubscriptionResponseDto[] {
    return subscriptions.map((subscription) => new SubscriptionResponseDto(subscription));
  }
}