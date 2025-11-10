import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  Put,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Constants } from 'src/common/constants';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller({ path: 'subscription', version: Constants.API_VERSION })
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @UseGuards(JwtAuthGuard,RolesGuard)
  @Post('create')
  async createSubscription(
    @Body() payloadSubscription: CreateSubscriptionDto,
    @Request() req: any,
  ) {
    const currentUserId = req.user.id;
    console.log('Current User ID in controller:', currentUserId); // Debug log
    return this.subscriptionService.create(payloadSubscription, currentUserId);
  }


  @UseGuards(JwtAuthGuard)
  // @Roles("Admin")
  @Get('list')
  async findAllSubscriptions(@Query('user_id') userId?: string) {
    return this.subscriptionService.findAllSubscriptions(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('read/:id')
  async findById(@Param('id', ParseIntPipe) findId: number) {
    return this.subscriptionService.findById(findId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('update/:id')
  async updateSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePayload: UpdateSubscriptionDto,
    @Request() req: any,
  ) {
    const currentUserId = req.user.id;
    return this.subscriptionService.updateSubscription(id, updatePayload, currentUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('delete/:id')
  async deleteSubscription(@Param('id', ParseIntPipe) deleteId: number) {
    return this.subscriptionService.deleteSubscription(deleteId);
  }
}