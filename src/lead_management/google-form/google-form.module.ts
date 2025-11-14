import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleFormController } from './google-form.controller';
import { GoogleFormService } from './google-form.service';
import { GoogleFormLead } from './entities/google-form.entity';
import { LeadsModule } from '../leads/leads.module';
import { MessageModule } from '../../message/message.module';
import { ConversationModule } from '../../conversation/conversation.module';
import { DatabaseManager } from 'src/common/database/database.manager';

@Module({
  imports: [
    TypeOrmModule.forFeature([GoogleFormLead]),
    forwardRef(() => LeadsModule),
    forwardRef(() => MessageModule),
    forwardRef(() => ConversationModule),
  ],
  controllers: [GoogleFormController],
  providers: [GoogleFormService,DatabaseManager],
  exports: [GoogleFormService],
})
export class GoogleFormModule {}
