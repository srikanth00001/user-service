// src/common/tenant/tenant.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseManager } from '../database/database.manager';
import { DataSource } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Injectable()
export class TenantService {
  constructor(
    private jwtService: JwtService,
    private dbManager: DatabaseManager,
  ) {}

  async resolveTenantFromToken(authHeader: string): Promise<{
    userId: string;
    email: string;
    dataSource: DataSource;
    tenantKey: string;
    user: any;
  }> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing token');
    }

    const token = authHeader.split(' ')[1];
    let payload: any;

    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const { sub: userId, email } = payload;
    if (!userId || !email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const masterUser = await this.dbManager.getMasterRepository(User).findOne({
      where: { id: userId },
    });

    const { dataSource, tenantKey } = await this.dbManager.getConnectionForUser({
      id: userId,
      email,
      tenantKey: masterUser?.tenantKey,
    });

    return { userId, email, dataSource, tenantKey, user: payload };
  }
}