import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { PlanService } from './plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Constants } from 'src/common/constants';
import { CreateSubscriptionDto } from 'src/subscription/dto/create-subscription.dto';
import { SubscriptionService } from 'src/subscription/subscription.service';

@Controller({ path: 'plan', version: Constants.API_VERSION })
export class PlanController {
  constructor(
    private readonly planService: PlanService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  // Create a new plan
  @UseGuards(JwtAuthGuard)
  @Post('create')
  createPlan(@Body() payloadPlan: CreatePlanDto, @Request() req: any) {
    const userId = req.user.id;
    payloadPlan.created_by = userId;
    payloadPlan.updated_by = userId;
    return this.planService.createPlan(payloadPlan);
  }

  // Fetch all plans
  @UseGuards(JwtAuthGuard)
  @Get('list')
  async findAllPlans() {
    return await this.planService.findAllPlans();
  }

  // Fetch a plan by ID
  @UseGuards(JwtAuthGuard)
  @Get('read/:id')
  async findById(@Param('id', ParseIntPipe) findId: number) {
    return await this.planService.findById(findId);
  }

  // Update a plan by ID
  @UseGuards(JwtAuthGuard)
  @Put('update/:id')
  async updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePayload: UpdatePlanDto,
    @Request() req: any,
  ) {
    const userId = req.user.id;
    updatePayload.updated_by = userId;
    return this.planService.updatePlan(id, updatePayload);
  }

  // Delete a plan by ID
  @UseGuards(JwtAuthGuard)
  @Delete('delete/:id')
  async deletePlan(@Param('id', ParseIntPipe) deleteId: number) {
    return await this.planService.deletePlan(deleteId);
  }

  // Subscribe to a plan
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribeToPlan(@Body() payloadSubscription: CreateSubscriptionDto, @Request() req: any) {
    const userId = req.user.id;
    return this.subscriptionService.create(payloadSubscription, userId);
  }
}