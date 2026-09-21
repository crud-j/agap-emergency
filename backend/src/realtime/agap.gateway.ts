import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { AgapWebSocketEvent, AgapEventName } from '@agap/shared';
import { INCIDENT_EVENTS, RESPONDER_EVENTS } from '@agap/shared';

/**
 * AGAP WebSocket Gateway — real-time event distribution.
 * WebSocket is for distribution ONLY. PostgreSQL is the source of truth.
 */
@WebSocketGateway({
  cors: {
    origin: process.env['CORS_ORIGIN']?.split(',') ?? ['http://localhost:3001'],
    credentials: true,
  },
  namespace: '/agap',
})
export class AgapGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgapGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:incident')
  handleJoinIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { incidentId: string },
  ) {
    client.join(`incident:${data.incidentId}`);
    this.logger.log(`Client ${client.id} joined incident room: ${data.incidentId}`);
  }

  @SubscribeMessage('join:ops')
  handleJoinOps(@ConnectedSocket() client: Socket) {
    client.join('ops:all');
    this.logger.log(`Client ${client.id} joined ops room`);
  }

  @SubscribeMessage('leave:incident')
  handleLeaveIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { incidentId: string },
  ) {
    client.leave(`incident:${data.incidentId}`);
  }

  emit<T>(event: AgapEventName, payload: T, room?: string): void {
    const envelope: AgapWebSocketEvent<T> = {
      event,
      data: payload,
      timestamp: new Date().toISOString(),
    };

    if (room) {
      this.server.to(room).emit(event, envelope);
    } else {
      this.server.emit(event, envelope);
    }
  }

  emitToOps<T>(event: AgapEventName, payload: T): void {
    this.emit(event, payload, 'ops:all');
  }

  emitToIncident<T>(event: AgapEventName, incidentId: string, payload: T): void {
    this.emit(event, payload, `incident:${incidentId}`);
  }
}
