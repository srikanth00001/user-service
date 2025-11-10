// src/lead_management/campaigns/campaigns.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Constants } from '../../common/constants';

@UseGuards(JwtAuthGuard)
@Controller({ path: 'campaigns', version: Constants.API_VERSION })
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  private getUser(req: any) {
    return { id: req.user.sub, email: req.user.email, tenantKey: req.user.tenantKey };
  }

  @Post('create')
  async create(@Body() dto: CreateCampaignDto, @Req() req: any) {
    const user = this.getUser(req);
    return this.campaignsService.create(dto, user);
  }

  @Get()
  async findAll(@Req() req: any) {
    const user = this.getUser(req);
    return this.campaignsService.findAll(user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const user = this.getUser(req);
    return this.campaignsService.findOne(id, user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCampaignDto,
    @Req() req: any,
  ) {
    const user = this.getUser(req);
    return this.campaignsService.update(id, dto, user);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const user = this.getUser(req);
    return this.campaignsService.remove(id, user);
  }
}