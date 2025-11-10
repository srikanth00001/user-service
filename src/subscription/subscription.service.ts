import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Subscription, SubscriptionStatus } from './entities/subscription.entity';
import { Repository } from 'typeorm';
import { Plan } from 'src/plan/entities/plan.entity';
import { User } from 'src/user/entities/user.entity';
import axios from 'axios';
import { ApiResponseDto } from 'src/common/dto/response.dto';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Plan)
    private planRepository: Repository<Plan>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async sendWebhook(eventType: string, payload: any) {
    try {
      const webhookUrl =
        process.env.WEBHOOK_URL ||
        'https://webhook.site/ba76f924-75ed-4cf6-b1ea-1fe06f5aa462';
      await axios.post(webhookUrl, { event: eventType, data: payload });
      console.log(`Webhook sent for ${eventType}`);
    } catch (error) {
      console.error(`Webhook failed for ${eventType}:`, error.message);
    }
  }

  async create(
  payloadSubscription: CreateSubscriptionDto,
  currentUserId: string,
): Promise<ApiResponseDto> {
  const { user_id, plan_id } = payloadSubscription;

  const user = await this.userRepository.findOne({ where: { id: user_id.toString() } });
  const plan = await this.planRepository.findOne({ where: { id: plan_id } });

  if (!user || !plan) {
    throw new NotFoundException('User or Plan not found');
  }

  // Check if user has an ACTIVE subscription
  const activeSub = await this.subscriptionRepository.findOne({
    where: {
      user: { id: user_id.toString() },
      status: SubscriptionStatus.ACTIVE,
    },
  });

  const isFirstSubscription = !activeSub;

  const newSubscription = this.subscriptionRepository.create({
    ...payloadSubscription,
    user,
    plan,
    plan_details: { ...plan },
    created_by: currentUserId,
    updated_by: currentUserId,
    status: isFirstSubscription
      ? SubscriptionStatus.ACTIVE
      : SubscriptionStatus.UPCOMING,
    active: isFirstSubscription, // only active if first
  });

  const saved = await this.subscriptionRepository.save(newSubscription);

  // If this is the first subscription → activate immediately
  if (isFirstSubscription) {
    await this.sendWebhook('SUBSCRIPTION_ACTIVATED', { subscription_id: saved.id });
  }

  return new ApiResponseDto({
    success: true,
    message: isFirstSubscription
      ? 'Subscription activated!'
      : 'Subscription queued! Will activate after current one expires.',
    data: saved,
  });
}

  async findAllSubscriptions(userId?: string): Promise<ApiResponseDto> {
  const qb = this.subscriptionRepository.createQueryBuilder('sub')
    .leftJoinAndSelect('sub.user', 'user')
    .leftJoinAndSelect('sub.plan', 'plan');

  if (userId) {
    qb.where('sub.user_id = :userId', { userId });
  }

  qb.orderBy('sub.start_date', 'DESC');

  const subscriptions = await qb.getMany();

  return new ApiResponseDto({
  success: true,
  message: 'Subscriptions retrieved successfully',
  data: subscriptions,
});
}

  async findById(findId: number): Promise<ApiResponseDto> {
    try {
      const subscription = await this.subscriptionRepository.findOne({
  where: { id: findId },
  relations: ['user', 'plan'],
});
      if (!subscription) {
        throw new NotFoundException(
          new ApiResponseDto({ success: false, message: `Subscription with ID ${findId} not found` }),
        );
      }
      return new ApiResponseDto({ success: true, message: 'Subscription retrieved successfully', data: subscription });
    } catch (error) {
      throw new InternalServerErrorException(
        new ApiResponseDto({ success: false, message: `Error retrieving subscription: ${error.message}` }),
      );
    }
  }

  async updateSubscription(
    id: number,
    updatePayload: UpdateSubscriptionDto,
    currentUserId: string,
  ): Promise<ApiResponseDto> {
    try {
      const existingSubscription = await this.subscriptionRepository.findOne({ where: { id } });
      if (!existingSubscription) {
        throw new NotFoundException(new ApiResponseDto({ success: false, message: `Subscription with ID ${id} not found` }));
      }

      const updateData: Partial<Subscription> = {
        ...updatePayload,
        reference_id: updatePayload.reference_id ?? existingSubscription.reference_id,
        
        updated_by: currentUserId,
        user_id: updatePayload.user_id?.toString() ?? existingSubscription.user_id,
        
      };

      Object.keys(updateData).forEach(
        (key) => updateData[key as keyof Subscription] === undefined && delete updateData[key as keyof Subscription],
      );

      await this.subscriptionRepository.update(id, updateData);

      const updatedSubscription = await this.subscriptionRepository.findOne({ where: { id }, relations: ['user', 'plan'] });

      return new ApiResponseDto({ success: true, message: `Subscription with ID ${id} updated successfully`, data: updatedSubscription });
    } catch (error) {
      throw new InternalServerErrorException(
        new ApiResponseDto({ success: false, message: `Error updating subscription: ${error.message}` }),
      );
    }
  }

  async deleteSubscription(deleteId: number): Promise<ApiResponseDto> {
    try {
      const subscription = await this.subscriptionRepository.findOne({ where: { id: deleteId } });
      if (!subscription) {
        throw new NotFoundException(new ApiResponseDto({ success: false, message: `Subscription with ID ${deleteId} not found` }));
      }

      await this.subscriptionRepository.remove(subscription);
      return new ApiResponseDto({ success: true, message: `Subscription with ID ${deleteId} deleted successfully` });
    } catch (error) {
      throw new InternalServerErrorException(
        new ApiResponseDto({ success: false, message: `Error deleting subscription: ${error.message}` }),
      );
    }
  }
}