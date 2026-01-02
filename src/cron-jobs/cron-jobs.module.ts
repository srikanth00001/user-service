import { Module } from '@nestjs/common';
import { CronJobsService } from './cron-jobs.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from 'src/subscription/entities/subscription.entity';
import { EmailService } from 'src/common/email/email.service';
import { DatabaseManager } from 'src/common/database/database.manager';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription])],
  providers: [CronJobsService, EmailService, DatabaseManager],
})
export class CronJobsModule {}
