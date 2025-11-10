import { Module } from '@nestjs/common';
import { GoogleFormController } from './google-form.controller';
import { LeadsService } from '../leads/leads.service';
import { GoogleFormService } from './google-form.service';
import { DatabaseManager } from 'src/common/database/database.manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleFormLead } from './entities/google-form.entity';

@Module({
  imports:[ TypeOrmModule.forFeature([GoogleFormLead])],
  controllers: [GoogleFormController],
  providers: [GoogleFormService,LeadsService, DatabaseManager],
})
export class GoogleFormModule {}
