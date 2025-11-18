import { Module, forwardRef } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { DatabaseManager } from 'src/common/database/database.manager';
import { WhatsAppModule } from 'src/whatsapp/whatsapp.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TeamInboxModule } from 'src/team-inbox/team-inbox.module';
import { MessageListener } from './message.listener';

@Module({
  imports: [
    WhatsAppModule,
    EventEmitterModule.forRoot(),
    forwardRef(() => TeamInboxModule), // wrap with forwardRef
  ],
  controllers: [MessageController],
  providers: [MessageService, DatabaseManager,MessageListener],
  exports: [MessageService],
})
export class MessageModule {}
