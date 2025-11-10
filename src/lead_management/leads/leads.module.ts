import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt'; // ✅ Add this
import { Lead } from './entities/lead.entity';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { Note } from './entities/note.entity';
import { Temp } from './entities/template.entity';
import { DatabaseManager } from 'src/common/database/database.manager';
import { TenantService } from 'src/common/tenant/tenant.service';
import { SharedJwtModule } from 'src/auth/jwt.module';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { ExcelLead } from './entities/excel-lead.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, Note, Temp,ExcelLead]),JwtModule.register({
      secret: 'JWT_SECRET', 
      signOptions: { expiresIn: '1d' },
    }),
    
  ],
  controllers: [LeadsController],
  providers: [LeadsService, DatabaseManager, TenantService,JwtStrategy],
  exports: [LeadsService],
})
export class LeadsModule {}
