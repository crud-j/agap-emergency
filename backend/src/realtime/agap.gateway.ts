import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { AgapWebSocketEvent, AgapEventName } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';

const DISPATCHER_ROLES = ['DISPATCHER', 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR', 'ORG_ADMINISTRATOR'];

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

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        this.logger.warn(`Unauthenticated WS connection rejected: ${client.id}`);
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token, { secret: process.env['JWT_SECRET'] ?? '' });
      client.data.user = payload;
      // Every authenticated socket auto-joins its own user room so per-user
      // events (e.g. notification.created) reach only that user.
      if (payload.sub) client.join(`user:${payload.sub}`);
      this.logger.log(`Authenticated WS: ${client.id} (userId=${payload.sub}, role=${payload.role})`);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Invalid WS token, disconnecting: ${client.id} — ${reason}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:incident')
  async handleJoinIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { incidentId: string },
  ) {
    const user = client.data.user;
    if (!user) {
      client.emit('error', 'Unauthorized');
      return;
    }

    if (!DISPATCHER_ROLES.includes(user.role)) {
      // Non-staff may only join an incident room if they are a participant:
      // the reporter, or an assigned responder (dispatch crew). This keeps the
      // incident-scoped chat/events restricted to participants (MOD-33).
      const incident = await this.prisma.incident.findFirst({
        where: { id: data.incidentId },
        include: { incident_reporters: true },
      });
      const isOwner = incident?.incident_reporters?.user_id === user.sub;
      const isCrew = isOwner
        ? false
        : (await this.prisma.dispatch_crew.count({
            where: { user_id: user.sub, dispatches: { incident_id: data.incidentId } },
          })) > 0;
      if (!isOwner && !isCrew) {
        client.emit('error', 'Forbidden: not a participant of this incident');
        return;
      }
    }

    client.join(`incident:${data.incidentId}`);
    this.logger.log(`Client ${client.id} joined incident:${data.incidentId}`);
  }

  @SubscribeMessage('join:ops')
  handleJoinOps(@ConnectedSocket() client: Socket) {
    const user = client.data.user;
    if (!user) {
      client.emit('error', 'Unauthorized');
      return;
    }
    if (!DISPATCHER_ROLES.includes(user.role)) {
      client.emit('error', 'Forbidden: insufficient role for ops room');
      return;
    }
    client.join('ops:all');
    this.logger.log(`Client ${client.id} (role=${user.role}) joined ops:all`);
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

  emitToUser<T>(event: AgapEventName, userId: string, payload: T): void {
    this.emit(event, payload, `user:${userId}`);
  }

  /** Broadcast to every connected (authenticated) client — e.g. public announcements. */
  broadcast<T>(event: AgapEventName, payload: T): void {
    this.emit(event, payload);
  }
}
