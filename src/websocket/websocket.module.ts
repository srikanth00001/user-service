import { Module, forwardRef } from '@nestjs/common';
import { MessageModule } from 'src/message/message.module';
import { MessageGateway } from './message.gateway';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [forwardRef(() => MessageModule),forwardRef(() => UserModule)],
  providers: [MessageGateway],
  exports: [MessageGateway],
})
export class WebSocketModule {}