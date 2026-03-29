import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

@Module({
  providers: [EventsGateway],
  exports: [EventsGateway],  // 导出供业务 Service 调用 broadcast()
})
export class WebsocketModule {}
