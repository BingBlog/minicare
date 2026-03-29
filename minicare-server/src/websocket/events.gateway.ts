import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export type WsEvent =
  | { type: 'record:created'; table: string; data: Record<string, unknown> }
  | { type: 'record:updated'; table: string; data: Record<string, unknown> }
  | { type: 'record:deleted'; table: string; id: string }
  | { type: 'member:joined'; member: Record<string, unknown> };

/**
 * EventsGateway — 家庭实时推送
 *
 * 连接流程：
 * 1. 客户端建立 WebSocket 连接（携带 JWT 做认证，TODO: 在 handleConnection 中验证）
 * 2. 客户端发送 join_family 消息，服务端将 socket 加入对应 family room
 * 3. 业务 Service 写入 MySQL 后调用 gateway.broadcast() 向 family room 广播
 *
 * Socket.IO 命名空间: /ws
 */
@WebSocketGateway({ namespace: '/ws', cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connections = 0;

  handleConnection(client: Socket) {
    this.connections++;
    console.log(`[WS] 连接建立 id=${client.id} 总连接数=${this.connections}`);
    // TODO: 从 handshake.auth.token 提取 JWT 并验证，踢出未授权连接
  }

  handleDisconnect(client: Socket) {
    this.connections--;
    console.log(`[WS] 连接断开 id=${client.id} 总连接数=${this.connections}`);
  }

  /**
   * 客户端加入家庭房间
   * 消息格式：{ familyId: "uuid" }
   */
  @SubscribeMessage('join_family')
  handleJoinFamily(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { familyId: string },
  ) {
    const roomName = `family:${data.familyId}`;
    client.join(roomName);
    client.emit('joined', { room: roomName });
    console.log(`[WS] ${client.id} 加入 ${roomName}`);
  }

  /**
   * 向指定家庭的所有连接客户端广播事件
   * 由业务 Service 调用（写入 MySQL 后触发）
   */
  broadcast(familyId: string, event: WsEvent) {
    this.server.to(`family:${familyId}`).emit('record_change', event);
  }
}
