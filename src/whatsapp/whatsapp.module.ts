import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { HttpModule } from '@nestjs/axios';
import { DatabaseManager } from 'src/common/database/database.manager';


@Module({
  imports: [HttpModule],
  providers: [WhatsAppService,DatabaseManager],
  exports: [WhatsAppService]
})
export class WhatsAppModule {}
