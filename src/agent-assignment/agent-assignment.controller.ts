// src/lead-assignment/lead-assignment.controller.ts
import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Constants } from 'src/common/constants';
import { AgentAssignmentService } from './agent-assignment.service';
import { CreateAgentAssignmentDto } from './dto/create-agent-assignment.dto';

@UseGuards(JwtAuthGuard)
@Controller({ path: 'lead-assignments', version: Constants.API_VERSION })
export class AgentAssignmentController {
  constructor(private readonly service: AgentAssignmentService) {}

  @Post()
  async create(@Body() dto: CreateAgentAssignmentDto, @Req() req: any) {
    const { userId, email, tenantKey } = this.getUser(req);
    return this.service.create(tenantKey, dto, userId, email);
  }

  private getUser(req: any) {
    return {
      userId: req.user?.sub || req.user?.id,
      email: req.user?.email,
      tenantKey: req.user?.tenantKey,
    };
  }
}