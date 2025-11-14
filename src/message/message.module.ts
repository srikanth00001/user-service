import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { DatabaseManager } from 'src/common/database/database.manager';
import { WhatsAppModule } from 'src/whatsapp/whatsapp.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    WhatsAppModule,       // provides WhatsAppService
    EventEmitterModule.forRoot(), // provides EventEmitter2
  ],
  controllers: [MessageController],
  providers: [MessageService,DatabaseManager],
  exports: [MessageService]
})
export class MessageModule {}
