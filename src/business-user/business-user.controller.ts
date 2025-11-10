import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseManager } from '../common/database/database.manager';
import { BusinessUserService } from './business-user.service';
import { BusinessUser } from './entities/business-user.entity';
import { BusinessRole } from 'src/business-role/entities/business-role.entity';
import { Constants } from '../common/constants';

@Controller({ path: 'business-users', version: Constants.API_VERSION })
@UseGuards(JwtAuthGuard)
export class BusinessUserController {
  constructor(private readonly dbManager: DatabaseManager) {}

  private async getService(tenantKey: string) {
    const ds = await this.dbManager.getOrCreateTenantConnection(tenantKey);
    return new BusinessUserService(
      ds.getRepository(BusinessUser),
      ds.getRepository(BusinessRole),
    );
  }

  private getUser(req: any) {
    return {
      userId: req.user?.sub,
      email: req.user?.email,
      tenantKey: req.user?.tenantKey,
    };
  }

  @Post()
  async create(@Body() dto: any, @Req() req: any) {
    const { tenantKey, email: createdBy } = this.getUser(req);

    if (!tenantKey) {
      throw new BadRequestException('Tenant key missing from token');
    }
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException('Request body is empty');
    }

    const service = await this.getService(tenantKey);
    return service.create(dto, tenantKey, createdBy);
  }

  @Get()
  async getTeam(@Req() req: any) {
    const { tenantKey } = this.getUser(req);
    const service = await this.getService(tenantKey);
    return service.getTeam(tenantKey);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    const { tenantKey } = this.getUser(req);
    const service = await this.getService(tenantKey);
    return service.update(id, dto, tenantKey);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    const { tenantKey } = this.getUser(req);
    const service = await this.getService(tenantKey);
    return service.delete(id, tenantKey);
  }
}
