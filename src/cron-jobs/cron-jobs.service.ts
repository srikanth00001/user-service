import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Subscription } from 'src/subscription/entities/subscription.entity';
import axios from 'axios';
import { SubscriptionStatus } from '../subscription/entities/subscription.entity';

@Injectable()
export class CronJobsService {
  private readonly logger = new Logger(CronJobsService.name);

  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
  ) {}

  @Cron('50 15 * * *')


  async handleSubscriptionQueue() {
  this.logger.log('Running subscription queue check...');

  const now = new Date();

  // Find users whose ACTIVE subscription has expired
  const expiredActiveSubs = await this.subscriptionRepository.find({
    where: {
      status: SubscriptionStatus.ACTIVE,
      expiry_date: LessThanOrEqual(now),
    },
    relations: ['user'],
  });

  for (const expiredSub of expiredActiveSubs) {
    const userId = expiredSub.user.id;

    // Mark current as EXPIRED
    await this.subscriptionRepository.update(expiredSub.id, {
      status: SubscriptionStatus.EXPIRED,
      active: false,
    });

    this.logger.log(`Expired subscription ${expiredSub.id} for user ${userId}`);

    // Find the next UPCOMING subscription (earliest start_date)
    const nextSub = await this.subscriptionRepository.findOne({
      where: {
        user: { id: userId },
        status: SubscriptionStatus.UPCOMING,
      },
      order: { start_date: 'ASC' },
    });

    if (nextSub) {
      // Activate it!
      await this.subscriptionRepository.update(nextSub.id, {
        status: SubscriptionStatus.ACTIVE,
        active: true,
        start_date: now, // or keep original? usually reset to now
      });

      this.logger.log(`Activated upcoming subscription ${nextSub.id}`);

      await this.sendWebhook('SUBSCRIPTION_ACTIVATED', {
        subscription_id: nextSub.id,
        user_id: userId,
        plan_name: nextSub.plan.name,
      });

      await this.sendWebhook('SUBSCRIPTION_EXPIRED', {
        previous_subscription_id: expiredSub.id,
      });
    } else {
      await this.sendWebhook('SUBSCRIPTION_EXPIRED_NO_QUEUE', {
        user_id: userId,
      });
    }
  }
}
  async deactivateExpiredSubscriptions() {
    try {
      console.log('Checking for expired subscriptions...');
      const expiredSubscriptions = await this.subscriptionRepository.find({
        where: { expiry_date: LessThanOrEqual(new Date()), active: true },
      });

      if (expiredSubscriptions.length === 0) {
        console.log('No expired subscriptions found.');
        return;
      }

      await this.subscriptionRepository
        .createQueryBuilder()
        .update(Subscription)
        .set({ active: false })
        .where('expiry_date <= CURRENT_TIMESTAMP AND active = true')
        .execute();

      console.log(`Deactivated ${expiredSubscriptions.length} expired subscriptions.`);

      for (const sub of expiredSubscriptions) {
        await this.sendWebhook('SUBSCRIPTION_EXPIRED_BROADCAST_STOPPED', {
          subscription_id: sub.id,
          user_id: sub.user_id,
          plan_id: sub.plan_id,
          expiry_date: sub.expiry_date,
        });
      }
    } catch (error) {
      console.error('Error during subscription deactivation:', error);
    }
  }

  async sendWebhook(eventType: string, payload: any) {
  try {
    const webhookUrl = process.env.WEBHOOK_URL;

    if (!webhookUrl) {
      throw new Error('WEBHOOK_URL is not defined in environment variables.');
    }

    console.log(`Sending ${eventType} webhook to ${webhookUrl}`);
    console.log('Webhook Payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(webhookUrl, { event: eventType, data: payload });
    console.log(`Webhook sent successfully. Status: ${response.status}`);
  } catch (error) {
    console.error(`Webhook failed for ${eventType}:`, error.message);
  }
}

}
