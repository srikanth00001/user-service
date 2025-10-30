import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Subscription } from 'src/subscription/entities/subscription.entity';
import axios from 'axios';

@Injectable()
export class CronJobsService {
  private readonly logger = new Logger(CronJobsService.name);

  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
  ) {}

  @Cron('50 15 * * *')
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
