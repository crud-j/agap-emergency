import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { AgapWebSocketEvent, AgapEventName } from '@agap/shared';
import { IncidentParticipantService } from './incident-participant.service';
import { SessionRevocationService } from '../auth/sessions/session-revocation.service';

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
export class AgapGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgapGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly participants: IncidentParticipantService,
    private readonly sessions: SessionRevocationService,
  ) {}

  private stopRevocationListener?: () => void;

  afterInit() {
    // Logout / password reset / deactivation: drop that session's live sockets now,
    // instead of letting them keep receiving incident events until they reconnect.
    this.stopRevocationListener = this.sessions.onRevoked((sessionIds) => {
      for (const sid of sessionIds) this.server.in(`session:${sid}`).disconnectSockets(true);
    });
  }

  onModuleDestroy() {
    this.stopRevocationListener?.();
  }

  async handleConnection(client: Socket) {
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
      if (payload.pwc === true) {
        this.logger.warn(`Forced password change required on WS connection, disconnecting: ${client.id}`);
        client.disconnect();
        return;
      }
      if (await this.sessions.isRevoked(payload.sid)) {
        this.logger.warn(`Revoked session on WS connection, disconnecting: ${client.id}`);
        client.disconnect();
        return;
      }
      client.data.user = payload;
      if (payload.sid) client.join(`session:${payload.sid}`);
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

  /**
   * Joins the incident room. The return value is the acknowledgement for clients
   * that pass one (`{ ok }`, never an `event` key, which Nest would emit instead);
   * the `error` event stays for clients that don't.
   */
  @SubscribeMessage('join:incident')
  async handleJoinIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { incidentId: string },
  ): Promise<{ ok: true } | { ok: false; reason: 'UNAUTHORIZED' | 'NOT_PARTICIPANT' }> {
    const user = client.data.user;
    if (!user) {
      client.emit('error', 'Unauthorized');
      return { ok: false, reason: 'UNAUTHORIZED' };
    }

    // Staff, the reporter, or an assigned crew member only. This keeps the
    // incident-scoped chat/events restricted to participants (MOD-33). Same rule
    // as the REST tracking endpoints — see IncidentParticipantService.
    const participation = await this.participants.getParticipation(
      { id: user.sub, role: user.role },
      data.incidentId,
    );
    if (!participation) {
      client.emit('error', 'Forbidden: not a participant of this incident');
      return { ok: false, reason: 'NOT_PARTICIPANT' };
    }

    client.join(`incident:${data.incidentId}`);
    this.logger.log(`Client ${client.id} joined incident:${data.incidentId}`);
    return { ok: true };
  }

  @SubscribeMessage('join:ops')
  handleJoinOps(@ConnectedSocket() client: Socket) {
    const user = client.data.user;
    if (!user) {
      client.emit('error', 'Unauthorized');
      return;
    }
    if (!this.participants.isStaff(user.role)) {
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
