import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Lead } from './entities/lead.entity';
import { Note } from './entities/note.entity';
import { Temp } from './entities/template.entity';
import { ExcelLead } from './entities/excel-lead.entity';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { DatabaseManager } from 'src/common/database/database.manager';
import { TenantService } from 'src/common/tenant/tenant.service';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { ConversationModule } from 'src/conversation/conversation.module';
import { MessageModule } from 'src/message/message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, Note, Temp, ExcelLead]),
    JwtModule.register({
      secret: 'JWT_SECRET',
      signOptions: { expiresIn: '1d' },
    }),
    forwardRef(() => ConversationModule),
    forwardRef(() => MessageModule),
  ],
  controllers: [LeadsController],
  providers: [LeadsService, DatabaseManager, TenantService, JwtStrategy],
  exports: [LeadsService],
})
export class LeadsModule {}
