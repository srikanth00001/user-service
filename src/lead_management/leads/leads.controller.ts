// src/lead_management/leads/leads.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UploadedFile,
  UseGuards,
  Req,
  ParseIntPipe,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Constants } from '../../common/constants';
import { TenantService } from '../../common/tenant/tenant.service';
import { Lead } from './entities/lead.entity';

@Controller({ path: 'leads', version: Constants.API_VERSION })
export class LeadsController {
  constructor(
    private leadsService: LeadsService,
    private tenantService: TenantService,
  ) {}

  private getUser(req: any) {
    // In microservice setup, token decoded by JwtAuthGuard from shared secret
    return { userId: req.user?.sub, email: req.user?.email, role: req.user?.role };
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Req() req: any) {
    const { userId, email, role } = this.getUser(req);
    return this.leadsService.findAll(userId, email, role);
  }

 @UseGuards(JwtAuthGuard)
  @Post('create')
  async create(@Body() dto: any, @Req() req: any) {
    const { userId, email } = this.getUser(req);
    return this.leadsService.create(dto, userId, email); // ← CALL SERVICE
  }

  @UseGuards(JwtAuthGuard)
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importLeads(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const { userId, email } = this.getUser(req);
    return this.leadsService.importLeads(file, userId, email);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':leadId/notes')
  async getNotes(
    @Param('leadId', ParseIntPipe) leadId: number,
    @Req() req: any,
  ) {
    const { userId, email } = this.getUser(req);
    return this.leadsService.getNotes(leadId, userId, email);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':leadId/notes')
  async addNote(
    @Param('leadId', ParseIntPipe) leadId: number,
    @Body('content') content: string,
    @Req() req: any,
  ) {
    const { userId, email } = this.getUser(req);
    return this.leadsService.addNote(leadId, content, userId, email);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':leadId')
  async deleteLead(
    @Param('leadId', ParseIntPipe) leadId: number,
    @Req() req: any,
  ) {
    const { userId, email } = this.getUser(req);
    await this.leadsService.delete(leadId, userId, email);
    return { status: 'success', message: 'Lead deleted successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':leadId/report')
  async generateReport(
    @Param('leadId', ParseIntPipe) leadId: number,
    @Req() req: any,
  ) {
    const { userId, email } = this.getUser(req);
    return this.leadsService.generateReport(leadId, userId, email);
  }

@Get('all')
@UseGuards(JwtAuthGuard)
async getAll(@Req() req: any) {
  const { userId, email } = this.getUser(req);
  return this.leadsService.getAllSources(userId, email); 
}
}