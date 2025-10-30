import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Subscription } from './entities/subscription.entity';
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
    try {
      console.log('Creating subscription with currentUserId:', currentUserId); // Debug log
      const { user_id, plan_id } = payloadSubscription;

      const user = await this.userRepository.findOne({ where: { id: user_id.toString() } });
      if (!user) {
        throw new NotFoundException(
          new ApiResponseDto({ success: false, message: `User with ID ${user_id} not found` }),
        );
      }

      const plan = await this.planRepository.findOne({ where: { id: plan_id } });
      if (!plan) {
        throw new NotFoundException(
          new ApiResponseDto({ success: false, message: `Plan with ID ${plan_id} not found` }),
        );
      }

      const subscription = this.subscriptionRepository.create({
        ...payloadSubscription,
        
        user,
        plan,
        plan_details: {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          period: plan.period,
          amount: plan.amount,
          offer_type: plan.offer_type,
          reference_id: payloadSubscription.reference_id ?? null,
          offer_value: plan.offer_value,
          active: plan.active,
        },
        created_by: currentUserId,
        updated_by: currentUserId,
      });

      console.log('Subscription before save:', subscription); // Debug log
      const savedSubscription = await this.subscriptionRepository.save(subscription);
      console.log('Subscription after save:', savedSubscription); // Debug log

      await this.sendWebhook('SUBSCRIPTION_ACTIVATED', {
        subscription_id: savedSubscription.id,
        user_id: savedSubscription.user.id,
        plan_id: savedSubscription.plan.id,
        payment_mode: savedSubscription.payment_mode,
        start_date: savedSubscription.start_date,
        expiry_date: savedSubscription.expiry_date,
      });

      return new ApiResponseDto({
        success: true,
        message: 'Subscription created successfully',
        data: savedSubscription,
      });
    } catch (error) {
      console.error('Error creating subscription:', error.message);
      throw new InternalServerErrorException(
        new ApiResponseDto({
          success: false,
          message: `Error creating subscription: ${error.message}`,
        }),
      );
    }
  }

  async findAllSubscriptions(userId?: string): Promise<ApiResponseDto> {
    try {
      const query = userId
        ? { where: { user_id: userId, active: true }, relations: ['user', 'plan'] }
        : { relations: ['user', 'plan'] };
      const subscriptions = await this.subscriptionRepository.find(query);
      return new ApiResponseDto({
        success: true,
        message: 'Subscriptions retrieved successfully',
        data: subscriptions,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        new ApiResponseDto({
          success: false,
          message: `Error retrieving subscriptions: ${error.message}`,
        }),
      );
    }
  }

  async findById(findId: number): Promise<ApiResponseDto> {
    try {
      const subscription = await this.subscriptionRepository.findOne({ where: { id: findId }, relations: ['user', 'plan'] });
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