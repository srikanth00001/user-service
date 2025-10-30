import { Module } from '@nestjs/common';
import { CronJobsService } from './cron-jobs.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from 'src/subscription/entities/subscription.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription])],
  providers: [CronJobsService],
})
export class CronJobsModule {}
