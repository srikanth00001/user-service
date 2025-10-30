import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { Repository } from 'typeorm';
import { ApiResponseDto } from 'src/common/dto/response.dto';
import { PlanResponseDto } from './dto/response-plan.dto';

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(Plan)
    private planRepository: Repository<Plan>,
  ) {}

  async createPlan(payloadPlan: CreatePlanDto): Promise<ApiResponseDto> {
    try {
      const plan = this.planRepository.create(payloadPlan);
      const savedPlan = await this.planRepository.save(plan);

      return new ApiResponseDto({
        success: true,
        message: 'Plan created successfully',
        data: new PlanResponseDto(savedPlan),
      });
    } catch (error) {
      throw new InternalServerErrorException(
        new ApiResponseDto({
          success: false,
          message: `Error creating plan: ${error.message}`,
        }),
      );
    }
  }

  async findAllPlans(): Promise<ApiResponseDto> {
    try {
      const plans = await this.planRepository.find();

      return new ApiResponseDto({
        success: true,
        message: 'Plans fetched successfully',
        data: plans.map(plan => new PlanResponseDto(plan)),
      });
    } catch (error) {
      throw new InternalServerErrorException(
        new ApiResponseDto({
          success: false,
          message: `Error fetching plans: ${error.message}`,
        }),
      );
    }
  }

  async findById(findId: number): Promise<ApiResponseDto> {
    try {
      const plan = await this.planRepository.findOne({ where: { id: findId } });

      if (!plan) {
        throw new NotFoundException(
          new ApiResponseDto({
            success: false,
            message: `Plan with ID ${findId} not found`,
          }),
        );
      }

      return new ApiResponseDto({
        success: true,
        message: 'Plan fetched successfully',
        data: new PlanResponseDto(plan),
      });
    } catch (error) {
      throw new InternalServerErrorException(
        new ApiResponseDto({
          success: false,
          message: `Error fetching plan: ${error.message}`,
        }),
      );
    }
  }

  async updatePlan(id: number, updatePayload: UpdatePlanDto): Promise<ApiResponseDto> {
    try {
      const result = await this.planRepository.update(id, updatePayload);

      if (result.affected === 0) {
        throw new NotFoundException(
          new ApiResponseDto({
            success: false,
            message: `Plan with ID ${id} not found`,
          }),
        );
      }

      const updatedPlan = await this.planRepository.findOne({ where: { id } });
      if (!updatedPlan) {
        throw new NotFoundException(
          new ApiResponseDto({
            success: false,
            message: `Plan with ID ${id} not found after update`,
          }),
        );
      }

      return new ApiResponseDto({
        success: true,
        message: 'Plan updated successfully',
        data: new PlanResponseDto(updatedPlan),
      });
    } catch (error) {
      throw new InternalServerErrorException(
        new ApiResponseDto({
          success: false,
          message: `Error updating plan: ${error.message}`,
        }),
      );
    }
  }

  async deletePlan(deleteId: number): Promise<ApiResponseDto> {
    try {
      const plan = await this.planRepository.findOne({ where: { id: deleteId } });

      if (!plan) {
        throw new NotFoundException(
          new ApiResponseDto({
            success: false,
            message: `Plan with ID ${deleteId} not found`,
          }),
        );
      }

      await this.planRepository.remove(plan);

      return new ApiResponseDto({
        success: true,
        message: 'Plan deleted successfully',
      });
    } catch (error) {
      throw new InternalServerErrorException(
        new ApiResponseDto({
          success: false,
          message: `Error deleting plan: ${error.message}`,
        }),
      );
    }
  }
}
