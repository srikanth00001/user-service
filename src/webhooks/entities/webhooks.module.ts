import { Module } from '@nestjs/common';
import { WebhookController } from './webhooks.controller';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import { TeamInboxModule } from 'src/team-inbox/team-inbox.module';
import { DatabaseManager } from 'src/common/database/database.manager';
import { BusinessUserModule } from 'src/business-user/business-user.module';


@Module({
  imports: [TeamInboxModule,BusinessUserModule],
  providers:[WhatsAppService,DatabaseManager],
  controllers: [WebhookController]
})
export class WebhooksModule {}
