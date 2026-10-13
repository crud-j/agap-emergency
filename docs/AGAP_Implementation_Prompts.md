# AGAP Backend — Implementation Session Prompts

> **How to use:** Copy the entire prompt block for the session you want to implement. Paste it as your first message in a new Claude Code session inside the `agap-emergency` workspace. Each prompt is self-contained — it gives the agent full context so it doesn't need to re-audit the codebase.
>
> Sessions must be completed in dependency order. SESSION 1 must come before SESSION 2, etc.

**Reference plan:** `docs/AGAP_Backend_Completion_Plan.md`  
**SMS provider:** Textbee.dev (Android-based gateway)  
**Backend:** NestJS modular monolith at `backend/src/`  
**Queue system:** BullMQ + Redis  
**ORM:** Prisma → PostgreSQL  

---

## SESSION 1 — Wire SOS/Shake to Job Queues

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL). 
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Wire the SOS/Shake emergency alert service to enqueue BullMQ jobs after incident creation.

CONTEXT:
- The method that creates incidents is `createFromSos()` in `backend/src/emergency-alerts/emergency-alerts.service.ts`
- It currently creates the incident in a Prisma $transaction, then only emits one WebSocket event — NO queue jobs are fired
- The module at `backend/src/emergency-alerts/emergency-alerts.module.ts` only imports RealtimeModule — no BullMQ queues registered
- All queue name constants are in `shared/src/constants/queue.constants.ts` (QUEUE_NAMES.SMS, QUEUE_NAMES.NOTIFICATIONS, QUEUE_NAMES.SLA_MONITOR)
- `backend/src/jobs/jobs.module.ts` already registers all queues globally — this module is already imported in AppModule
- CRITICAL RELIABILITY RULE: Queue failure must NEVER affect the returned incident — all queue.add() calls must be in try/catch blocks

READ THESE FILES FIRST before making any changes:
1. backend/src/emergency-alerts/emergency-alerts.service.ts
2. backend/src/emergency-alerts/emergency-alerts.module.ts
3. shared/src/constants/queue.constants.ts

CHANGES TO MAKE:

FILE 1: backend/src/emergency-alerts/emergency-alerts.module.ts
- Add to imports array: BullModule.registerQueue({ name: QUEUE_NAMES.SMS }), BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }), BullModule.registerQueue({ name: QUEUE_NAMES.SLA_MONITOR })
- Add to imports at top: import { BullModule } from '@nestjs/bullmq'; import { QUEUE_NAMES } from '@agap/shared';

FILE 2: backend/src/emergency-alerts/emergency-alerts.service.ts
- Add imports: import { InjectQueue } from '@nestjs/bullmq'; import { Queue } from 'bullmq';
- Update constructor to inject three queues:
  @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
  @InjectQueue(QUEUE_NAMES.SLA_MONITOR) private readonly slaQueue: Queue,
- In createFromSos(), AFTER the this.realtime.notifyIncidentCreated() try/catch block and BEFORE the final return, add a second try/catch block that enqueues:

  try {
    // Build SMS payload — must be under 160 chars
    const hasCoords = (dto.latitude !== undefined && dto.longitude !== undefined) ? 'Y' : 'N';
    const lat = dto.latitude?.toFixed(4) ?? '0';
    const lng = dto.longitude?.toFixed(4) ?? '0';
    const unixTs = Math.floor(incident.created_at.getTime() / 1000);
    const smsPayload = `AGAP|${incident.public_reference}|${lat},${lng}|${unixTs}|${incident.category}|C:${hasCoords}`;

    await this.smsQueue.add('emergency-sms', {
      phone: process.env['MDRRMO_OPS_PHONE'] ?? '',
      message: smsPayload.slice(0, 160),
      incidentId: incident.id,
    });

    await this.notificationQueue.add('ops-center-alert', {
      channel: 'PUSH',
      title: `New ${incident.category} Alert`,
      body: `${incident.public_reference} — ${incident.description ?? 'Emergency reported'}`,
      data: { incidentId: incident.id, type: 'INCIDENT_CREATED' },
    });

    if (userId) {
      await this.notificationQueue.add('emergency-contact-notify', {
        userId,
        channel: 'EMERGENCY_CONTACTS',
        body: `Emergency alert submitted. Ref: ${incident.public_reference}`,
        data: { incidentId: incident.id },
      });
    }

    await this.slaQueue.add(
      'sla-monitor',
      { incidentId: incident.id, escalationType: 'ACKNOWLEDGEMENT' },
      { delay: Number(process.env['DEFAULT_SLA_ACKNOWLEDGE_SECONDS'] ?? 120) * 1000 },
    );
  } catch (err) {
    this.logger.error(`Queue jobs failed for ${incident.id}: ${String(err)}. Incident unaffected.`);
  }

VERIFY after implementation:
- Run: docker exec agap-redis redis-cli KEYS "bull:*"
- After POST /api/v1/emergency-alerts/sos, the above command should show keys for bull:sms:*, bull:notifications:*, bull:sla-monitor:* queues
- The endpoint must still return the incident even if Redis is down (test by stopping Redis temporarily)

DO NOT:
- Do not change the $transaction logic or the incident creation flow
- Do not throw errors from within the queue try/catch block
- Do not add queue jobs inside the $transaction itself
```

---

## SESSION 2 — SMS Processor: Textbee.dev API

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Implement the SMS BullMQ processor to send real SMS via the Textbee.dev API.

PREREQUISITE: SESSION 1 must be complete (queue jobs must already be enqueued after SOS creation).

CONTEXT:
- The SMS processor stub is at backend/src/jobs/processors/sms.processor.ts
- It has a SmsJobData interface: { phone: string; message: string; incidentId?: string }
- The processor class is SmsProcessor extending WorkerHost
- The process() method currently only logs and does nothing
- Textbee.dev is an Android-based SMS gateway
- Textbee API: POST https://api.textbee.dev/api/v1/gateway/devices/{deviceId}/send-sms
- Textbee headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
- Textbee body: { recipients: [phoneNumber], message: messageText }
- CRITICAL RELIABILITY RULE: SMS failure must NEVER throw — catch all errors, log them, return void

READ THESE FILES FIRST:
1. backend/src/jobs/processors/sms.processor.ts
2. backend/src/jobs/jobs.module.ts
3. backend/package.json (check if axios is already installed)

CHANGES TO MAKE:

FILE 1: backend/src/jobs/processors/sms.processor.ts
- If axios is not in backend/package.json, add install instruction: pnpm --filter @agap/backend add axios
- Add import: import { ConfigService } from '@nestjs/config'; import axios from 'axios';
- Inject ConfigService in constructor: constructor(private readonly config: ConfigService) { super(); }
- Replace the TODO process() body with:

  async process(job: Job<SmsJobData>): Promise<void> {
    this.logger.log(`Processing SMS job ${job.id} to ${job.data.phone}`);
    try {
      const message = job.data.message.length > 160
        ? job.data.message.slice(0, 159) + '…'
        : job.data.message;

      const apiKey = this.config.get<string>('TEXTBEE_API_KEY');
      const deviceId = this.config.get<string>('TEXTBEE_DEVICE_ID');

      if (!apiKey || !deviceId) {
        this.logger.warn(`SMS skipped: TEXTBEE_API_KEY or TEXTBEE_DEVICE_ID not configured`);
        return;
      }

      await axios.post(
        `https://api.textbee.dev/api/v1/gateway/devices/${deviceId}/send-sms`,
        { recipients: [job.data.phone], message },
        { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }, timeout: 10000 },
      );

      this.logger.log(`SMS delivered to ${job.data.phone} | incidentId=${job.data.incidentId ?? 'n/a'}`);
    } catch (err) {
      this.logger.error(`SMS job ${job.id} failed: ${String(err)} | incidentId=${job.data.incidentId ?? 'n/a'}. Incident unaffected.`);
    }
  }

FILE 2: backend/src/jobs/jobs.module.ts
- Import ConfigModule if not already: import { ConfigModule } from '@nestjs/config';
- Add ConfigModule to the imports array of JobsModule

ENV VARS — add to backend/.env (copy template from .env.example):
  TEXTBEE_API_KEY=your_key_from_textbee_dashboard
  TEXTBEE_DEVICE_ID=your_device_id_from_textbee_dashboard
  MDRRMO_OPS_PHONE=+639XXXXXXXXX

VERIFY:
- Trigger POST /api/v1/emergency-alerts/sos
- Check backend logs for "SMS delivered to..." or the error message
- If env vars are not set, the log should say "SMS skipped: not configured" — NOT a crash

DO NOT:
- Do not call the Textbee API from inside the $transaction or from EmergencyAlertsService directly
- Do not propagate (throw) SMS errors — the processor must always complete cleanly
- Do not hardcode API keys in source files
```

---

## SESSION 3 — Push Notification Processor: Firebase FCM

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Implement the notification BullMQ processor to deliver push notifications via Firebase FCM.

PREREQUISITE: SESSION 1 complete (queue jobs being enqueued).

CONTEXT:
- The notification processor stub is at backend/src/jobs/processors/notification.processor.ts
- NotificationJobData interface: { userId?: string; phone?: string; channel: string; title?: string; body: string; data?: Record<string, unknown> }
- The process() method has a switch on job.data.channel with empty cases: 'SMS', 'PUSH', 'IN_APP'
- The EMERGENCY_CONTACTS channel (added by SESSION 1) also needs handling
- FCM tokens are stored in the database — look up by userId in system_configurations table (key = `fcm_token:{userId}`) OR in a dedicated push_tokens table if it exists (check schema.prisma)
- CRITICAL: Notification failure must NEVER throw or affect incident records

READ THESE FILES FIRST:
1. backend/src/jobs/processors/notification.processor.ts
2. backend/prisma/schema.prisma (search for push_token or fcm_token to find the right table)
3. backend/src/common/prisma/prisma.service.ts (to understand PrismaService injection)

INSTALL DEPENDENCY:
  pnpm --filter @agap/backend add firebase-admin

CHANGES TO MAKE:

FILE 1: backend/src/jobs/processors/notification.processor.ts
- Add imports:
  import * as admin from 'firebase-admin';
  import { ConfigService } from '@nestjs/config';
  import { PrismaService } from '../../common/prisma/prisma.service';
  import { InjectQueue } from '@nestjs/bullmq';
  import { Queue } from 'bullmq';
  import { QUEUE_NAMES } from '@agap/shared';

- Update constructor to inject ConfigService, PrismaService, and SMS queue:
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  ) {
    super();
    // Initialize Firebase Admin once
    if (admin.apps.length === 0) {
      const projectId = config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = config.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
      if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
      }
    }
  }

- Replace the switch cases in process():
  case 'PUSH':
    await this.sendPush(job.data);
    break;
  case 'SMS':
    await this.smsQueue.add('notification-sms', {
      phone: job.data.phone ?? '',
      message: job.data.body,
    });
    break;
  case 'IN_APP':
    // WebSocket delivery is handled by RealtimeService from the originating service
    this.logger.log(`IN_APP notification queued for userId=${job.data.userId}`);
    break;
  case 'EMERGENCY_CONTACTS':
    await this.notifyEmergencyContacts(job.data);
    break;

- Add private methods:

  private async sendPush(data: NotificationJobData): Promise<void> {
    if (!data.userId) return;
    try {
      // Find FCM token — adjust table/field name to match your schema.prisma
      const tokenRecord = await this.prisma.push_tokens?.findFirst({
        where: { user_id: data.userId, is_active: true },
      });
      if (!tokenRecord?.token) {
        this.logger.warn(`No FCM token for userId=${data.userId}`);
        return;
      }
      if (admin.apps.length === 0) {
        this.logger.warn('Firebase not initialized — PUSH skipped');
        return;
      }
      await admin.messaging().send({
        token: tokenRecord.token,
        notification: { title: data.title, body: data.body },
        data: data.data ? Object.fromEntries(Object.entries(data.data).map(([k, v]) => [k, String(v)])) : {},
      });
    } catch (err) {
      this.logger.error(`Push failed for userId=${data.userId}: ${String(err)}`);
    }
  }

  private async notifyEmergencyContacts(data: NotificationJobData): Promise<void> {
    if (!data.userId) return;
    try {
      const contacts = await this.prisma.emergency_contacts.findMany({
        where: { user_id: data.userId, notify_on_emergency: true },
      });
      for (const contact of contacts) {
        if (contact.phone_number) {
          await this.smsQueue.add('emergency-contact-sms', {
            phone: contact.phone_number,
            message: data.body,
          });
        }
      }
    } catch (err) {
      this.logger.error(`Emergency contact notify failed for userId=${data.userId}: ${String(err)}`);
    }
  }

NOTE: The push_tokens table name may differ — check schema.prisma and adjust accordingly. If it does not exist yet, the sendPush method should just log a warning and return cleanly.

FILE 2: backend/src/jobs/jobs.module.ts
- Import PrismaModule: import { PrismaModule } from '../common/prisma/prisma.module';
- Add PrismaModule to imports array
- Add BullModule.registerQueue({ name: QUEUE_NAMES.SMS }) to imports if not already present

ENV VARS — add to backend/.env:
  FIREBASE_PROJECT_ID=your_project_id
  FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

VERIFY:
- Trigger POST /api/v1/emergency-alerts/sos
- Backend logs should show "Processing notification job" and either "Push sent" or "No FCM token for userId=..."
- If Firebase env vars missing: logs "Firebase not initialized — PUSH skipped" — NOT a crash
```

---

## SESSION 4 — WebSocket Authentication Guard

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Add JWT authentication to the WebSocket gateway so unauthenticated clients cannot connect.

PREREQUISITE: None (standalone security fix).

CONTEXT:
- The gateway class is AgapGateway in backend/src/realtime/agap.gateway.ts
- It implements OnGatewayConnection and OnGatewayDisconnect
- handleConnection() currently only logs "Client connected: {id}" — no auth check
- Two subscription handlers exist: 'join:incident' and 'join:ops' — both accept any client without role check
- The JWT strategy is already implemented at backend/src/auth/ — JwtService is available
- The realtime module is at backend/src/realtime/realtime.module.ts
- User roles are in shared/src/enums/user-role.enum.ts

READ THESE FILES FIRST:
1. backend/src/realtime/agap.gateway.ts
2. backend/src/realtime/realtime.module.ts
3. backend/src/auth/auth.module.ts (to understand JWT module setup)
4. shared/src/enums/user-role.enum.ts

CHANGES TO MAKE:

FILE 1 (CREATE NEW): backend/src/realtime/ws-jwt.guard.ts
  import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
  import { JwtService } from '@nestjs/jwt';
  import { WsException } from '@nestjs/websockets';
  import { Socket } from 'socket.io';

  @Injectable()
  export class WsJwtGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) {}

    canActivate(context: ExecutionContext): boolean {
      const client: Socket = context.switchToWs().getClient();
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) throw new WsException('Unauthorized');
      try {
        const payload = this.jwtService.verify(token, {
          secret: process.env['JWT_SECRET'],
        });
        client.data.user = payload;
        return true;
      } catch {
        throw new WsException('Invalid or expired token');
      }
    }
  }

FILE 2: backend/src/realtime/agap.gateway.ts
- Add import: import { WsJwtGuard } from './ws-jwt.guard'; import { PrismaService } from '../common/prisma/prisma.service';
- Inject PrismaService and JwtService in constructor:
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}
- Replace handleConnection() with:
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
      const payload = this.jwtService.verify(token, { secret: process.env['JWT_SECRET'] });
      client.data.user = payload;
      this.logger.log(`Authenticated WS: ${client.id} (userId=${payload.sub}, role=${payload.role})`);
    } catch {
      this.logger.warn(`Invalid WS token, disconnecting: ${client.id}`);
      client.disconnect();
    }
  }

- Replace join:incident handler to add role-based authorization:
  @SubscribeMessage('join:incident')
  async handleJoinIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { incidentId: string },
  ) {
    const user = client.data.user;
    if (!user) { client.emit('error', 'Unauthorized'); return; }

    const DISPATCHER_ROLES = ['DISPATCHER', 'SUPERVISOR', 'SYSTEM_ADMIN', 'ORG_ADMIN'];
    if (!DISPATCHER_ROLES.includes(user.role)) {
      // Citizen: verify this incident belongs to them
      const incident = await this.prisma.incident.findFirst({
        where: { id: data.incidentId },
        include: { incident_reporters: true },
      });
      const isOwner = incident?.incident_reporters?.some((r) => r.user_id === user.sub);
      if (!isOwner) {
        client.emit('error', 'Forbidden: not your incident');
        return;
      }
    }
    client.join(`incident:${data.incidentId}`);
    this.logger.log(`Client ${client.id} joined incident:${data.incidentId}`);
  }

- Replace join:ops handler:
  @SubscribeMessage('join:ops')
  handleJoinOps(@ConnectedSocket() client: Socket) {
    const user = client.data.user;
    if (!user) { client.emit('error', 'Unauthorized'); return; }
    const OPS_ROLES = ['DISPATCHER', 'SUPERVISOR', 'SYSTEM_ADMIN', 'ORG_ADMIN'];
    if (!OPS_ROLES.includes(user.role)) {
      client.emit('error', 'Forbidden: insufficient role for ops room');
      return;
    }
    client.join('ops:all');
    this.logger.log(`Client ${client.id} (role=${user.role}) joined ops:all`);
  }

FILE 3: backend/src/realtime/realtime.module.ts
- Import JwtModule and PrismaModule:
  import { JwtModule } from '@nestjs/jwt';
  import { PrismaModule } from '../common/prisma/prisma.module';
- Add to imports array: JwtModule.register({}), PrismaModule
- Add WsJwtGuard to providers array

VERIFY:
- Connect to ws://localhost:3002/agap WITHOUT a token → should be immediately disconnected
- Connect WITH a valid JWT in handshake.auth.token → should succeed
- Emit 'join:ops' as a CITIZEN role → should receive 'error' event with 'Forbidden'
- Emit 'join:ops' as DISPATCHER role → should join 'ops:all' room
```

---

## SESSION 5 — Realtime Emits: Location + Dispatch

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Wire location tracking and dispatch status changes to emit WebSocket events via RealtimeService.

PREREQUISITE: SESSION 4 (WebSocket auth guard) recommended but not strictly required.

CONTEXT:
- LocationsService is at backend/src/locations/locations.service.ts
  - Method trackResponder() saves location_history to DB but does NOT emit WebSocket events
  - The service constructor currently only injects PrismaService
- DispatchService is at backend/src/dispatch/dispatch.service.ts
  - Method create() creates dispatch record but does NOT emit WebSocket events
  - The service constructor only injects PrismaService
- RealtimeService is at backend/src/realtime/realtime.service.ts — it has emit methods
- INCIDENT_EVENTS and RESPONDER_EVENTS constants are in @agap/shared
- The emitToIncident() or equivalent method emits to the `incident:{id}` room

READ THESE FILES FIRST:
1. backend/src/locations/locations.service.ts (full file — check trackResponder method)
2. backend/src/dispatch/dispatch.service.ts (check create, cancel methods)
3. backend/src/realtime/realtime.service.ts (understand available emit methods)
4. backend/src/locations/locations.module.ts
5. backend/src/dispatch/dispatch.module.ts
6. shared/src/events/incident.events.ts
7. shared/src/events/responder.events.ts

CHANGES TO MAKE:

FILE 1: backend/src/locations/locations.service.ts
- Add imports: import { RealtimeService } from '../realtime/realtime.service'; import { INCIDENT_EVENTS } from '@agap/shared';
- Add RealtimeService to constructor injection: constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeService) {}
- In trackResponder(), after the prisma.location_history.create() call succeeds, add:
  try {
    this.realtime.emit(INCIDENT_EVENTS.LOCATION_UPDATED, {
      incidentId: dto.incidentId,
      userId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      recordedAt: record.recorded_at,
    });
  } catch (err) {
    this.logger.warn(`Realtime emit failed for location update: ${String(err)}`);
  }
  NOTE: Use the exact emit method signature from realtime.service.ts — adapt if the method name differs

FILE 2: backend/src/dispatch/dispatch.service.ts
- Add imports: import { RealtimeService } from '../realtime/realtime.service'; import { INCIDENT_EVENTS } from '@agap/shared';
- Add RealtimeService to constructor
- In create(), after the dispatch DB record is committed, add:
  try {
    this.realtime.emit(INCIDENT_EVENTS.DISPATCHED, {
      incidentId: dispatch.incident_id,
      dispatchId: dispatch.id,
      resourceId: dto.resourceId,
      status: dispatch.status,
    });
  } catch (err) {
    this.logger.warn(`Realtime emit failed for dispatch create: ${String(err)}`);
  }
- Similarly in cancel() and reassign() methods (if they exist), emit appropriate events

FILE 3: backend/src/locations/locations.module.ts
- Add RealtimeModule to imports array: import { RealtimeModule } from '../realtime/realtime.module';

FILE 4: backend/src/dispatch/dispatch.module.ts
- Add RealtimeModule to imports array

VERIFY:
- Open two browser tabs with a WebSocket client (e.g. wscat or Socket.io client)
- Tab 1: connect as DISPATCHER and emit 'join:ops'
- Tab 2: POST /api/v1/locations/track with incidentId
- Tab 1 should receive 'incident.location_updated' event
- POST /api/v1/dispatch → Tab 1 should receive 'incident.dispatched' event

DO NOT:
- Do not put realtime.emit() inside the Prisma transaction
- Do not let emit failures affect the return value of the service methods
```

---

## SESSION 6 — SLA Monitor Processor

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Implement the SLA monitor BullMQ processor that detects when an incident has not been acknowledged in time and creates an escalation record.

PREREQUISITE: SESSION 1 (SLA monitor jobs being enqueued after SOS creation).

CONTEXT:
- The SLA processor stub is at backend/src/jobs/processors/sla-monitor.processor.ts
- A delayed BullMQ job (sla-monitor) is enqueued by SESSION 1 with:
  { incidentId: string, escalationType: 'ACKNOWLEDGEMENT' }
  after DEFAULT_SLA_ACKNOWLEDGE_SECONDS * 1000 milliseconds
- When the job fires, check if incident has been acknowledged. If NOT → create escalation
- The escalation model exists in schema.prisma — check the exact table/field names before implementing
- Emit escalation.created WebSocket event after creating the escalation record
- Then enqueue a NOTIFICATION job to notify all SUPERVISOR users in the org

READ THESE FILES FIRST:
1. backend/src/jobs/processors/sla-monitor.processor.ts
2. backend/prisma/schema.prisma (search for "escalation" to find the model)
3. backend/src/realtime/realtime.service.ts
4. shared/src/enums/incident-status.enum.ts

CHANGES TO MAKE:

FILE 1: backend/src/jobs/processors/sla-monitor.processor.ts
- Add imports:
  import { PrismaService } from '../../common/prisma/prisma.service';
  import { RealtimeService } from '../../realtime/realtime.service';
  import { ConfigService } from '@nestjs/config';
  import { InjectQueue } from '@nestjs/bullmq';
  import { Queue } from 'bullmq';
  import { QUEUE_NAMES, INCIDENT_EVENTS } from '@agap/shared';

- Update constructor to inject PrismaService, RealtimeService, ConfigService, and NOTIFICATIONS queue

- Implement process(job) method:
  The escalationType will be 'ACKNOWLEDGEMENT', 'DISPATCH', or 'RESPONSE'
  For ACKNOWLEDGEMENT: incident should have moved past 'SUBMITTED' status
  
  const TERMINAL_STATUSES = ['CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED', 'CLOSED', 'RESOLVED'];
  const PROGRESSION_MAP = {
    ACKNOWLEDGEMENT: ['RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING'],
    DISPATCH: ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING'],
    RESPONSE: ['ON_SCENE', 'TRANSPORTING', 'ASSISTING'],
  };
  
  Logic:
  1. Load incident by job.data.incidentId
  2. If not found → return (stale job)
  3. If incident.status in TERMINAL_STATUSES → return (already resolved)
  4. Get expectedStatuses = PROGRESSION_MAP[job.data.escalationType]
  5. If incident.status is already in expectedStatuses → return (SLA met, no escalation needed)
  6. Create escalation record in DB (use exact field names from schema.prisma):
     - incident_id, type = job.data.escalationType, status = 'OPEN', triggered_at = now
  7. Enqueue notification to supervisors:
     - Load all users with role 'SUPERVISOR' where org matches incident's org
     - For each: notificationQueue.add('sla-escalation', { userId, channel: 'PUSH', title: 'SLA Breach', body: `Incident ${incident.public_reference} not ${job.data.escalationType.toLowerCase()} within SLA` })
  8. Emit WebSocket event: this.realtime.emit(INCIDENT_EVENTS.ESCALATED, { incidentId, escalationType, incidentStatus: incident.status })
  9. If escalationType is ACKNOWLEDGEMENT, enqueue next SLA tier (DISPATCH threshold):
     await this.slaQueue.add('sla-monitor', { incidentId: job.data.incidentId, escalationType: 'DISPATCH' }, { delay: Number(process.env['DEFAULT_SLA_DISPATCH_SECONDS'] ?? 300) * 1000 })
  
  Wrap entire body in try/catch — log errors, never throw

FILE 2: backend/src/jobs/jobs.module.ts
- Import PrismaModule, RealtimeModule, ConfigModule
- Add them to imports array
- Add BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }) if not present

VERIFY:
- Trigger POST /api/v1/emergency-alerts/sos
- Wait DEFAULT_SLA_ACKNOWLEDGE_SECONDS (default: 120 seconds, or set to 10 for testing)
- Check DB: SELECT * FROM escalations WHERE incident_id = '...' — should have a row
- Check backend logs: "SLA breach: ACKNOWLEDGEMENT for incident INC-..."
```

---

## SESSION 7 — ETA Calculation: Real Routing API

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Replace the ETA stub in LocationsService with a real routing API call (OSRM or Google Maps).

PREREQUISITE: SESSION 5 (location tracking emits must be wired first).

CONTEXT:
- LocationsService is at backend/src/locations/locations.service.ts
- The reverseGeocode() method currently returns a hardcoded 'Bocaue, Bulacan' placeholder
- There may be a getEta() method that returns null — check the file for it
- OSRM is the recommended free option: public instance at http://router.project-osrm.org
  - OSRM route endpoint: GET /route/v1/driving/{src_lng},{src_lat};{dst_lng},{dst_lat}?overview=false
  - Response: { routes: [{ duration: seconds, distance: meters }] }
- ETA is ALWAYS an estimate — never label it as exact (architectural rule)
- If routing fails → return { eta_seconds: null, is_estimate: true } — never throw

READ THESE FILES FIRST:
1. backend/src/locations/locations.service.ts (full file)
2. backend/prisma/schema.prisma (search 'location_history' and 'dispatches' for field names)

CHANGES TO MAKE:

FILE 1: backend/src/locations/locations.service.ts
- Add import: import { ConfigService } from '@nestjs/config'; import axios from 'axios';
- Inject ConfigService in constructor

- Implement or replace getEta(incidentId: string) method:

  async getEta(incidentId: string) {
    try {
      // Get incident GPS location (destination)
      const incidentLoc = await this.prisma.incident_locations.findFirst({
        where: { incident_id: incidentId },
        orderBy: { created_at: 'desc' },
      });
      if (!incidentLoc) return { eta_seconds: null, is_estimate: true, reason: 'No incident location' };

      // Get active dispatch → resource → latest location (origin)
      const dispatch = await this.prisma.dispatches.findFirst({
        where: { incident_id: incidentId, status: { in: ['DISPATCHED', 'EN_ROUTE'] } },
        include: { resources: true },
      });
      if (!dispatch) return { eta_seconds: null, is_estimate: true, reason: 'No active dispatch' };

      const responderLoc = await this.prisma.location_history.findFirst({
        where: { incident_id: incidentId },
        orderBy: { recorded_at: 'desc' },
      });
      if (!responderLoc) return { eta_seconds: null, is_estimate: true, reason: 'No responder location' };

      const routingUrl = this.config.get<string>('MAP_PROVIDER_ROUTING_URL') ?? 'http://router.project-osrm.org';
      const url = `${routingUrl}/route/v1/driving/${responderLoc.longitude},${responderLoc.latitude};${incidentLoc.longitude},${incidentLoc.latitude}?overview=false`;

      const response = await axios.get(url, { timeout: 5000 });
      const duration = response.data?.routes?.[0]?.duration as number | undefined;
      if (!duration) return { eta_seconds: null, is_estimate: true };

      const etaSeconds = Math.round(duration);
      return {
        eta_seconds: etaSeconds,
        is_estimate: true,
        estimated_arrival: new Date(Date.now() + etaSeconds * 1000).toISOString(),
      };
    } catch (err) {
      this.logger.warn(`ETA calculation failed: ${String(err)}`);
      return { eta_seconds: null, is_estimate: true };
    }
  }

ENV VARS — add to backend/.env:
  MAP_PROVIDER_ROUTING_URL=http://router.project-osrm.org
  # OR for Google Maps:
  # MAP_PROVIDER_ROUTING_URL=https://maps.googleapis.com/maps/api/directions/json
  # MAP_PROVIDER_API_KEY=your_google_key

VERIFY:
- GET /api/v1/locations/eta/:incidentId with an incident that has location + active dispatch + responder location history
- Should return { eta_seconds: 240, is_estimate: true, estimated_arrival: "..." }
- With no active dispatch: should return { eta_seconds: null, is_estimate: true, reason: 'No active dispatch' }
```

---

## SESSION 8 — Reverse Geocoding

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Replace the hardcoded geocoding stub in LocationsService with a real reverse geocoding API call.

PREREQUISITE: None (standalone change).

CONTEXT:
- LocationsService is at backend/src/locations/locations.service.ts
- The reverseGeocode() method currently returns hardcoded { formatted_address: 'Bocaue, Bulacan', ... }
- Use Nominatim (free, no API key required) for reverse geocoding
- Nominatim endpoint: GET https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&accept-language=en
- Nominatim requires a User-Agent header (ToS requirement) — set to 'AGAP Emergency System (agap@bocaue.gov.ph)'
- On failure → return { formatted_address: null, barangay: null, municipality: 'Bocaue', province: 'Bulacan' }

READ THESE FILES FIRST:
1. backend/src/locations/locations.service.ts (find the reverseGeocode method)

CHANGES TO MAKE:

FILE 1: backend/src/locations/locations.service.ts
- Ensure axios is imported
- Replace reverseGeocode() stub:

  async reverseGeocode(lat: number, lng: number) {
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: { lat, lon: lng, format: 'json', 'accept-language': 'en', zoom: 18 },
        headers: { 'User-Agent': 'AGAP Emergency System (agap@bocaue.gov.ph)' },
        timeout: 5000,
      });
      const addr = response.data?.address ?? {};
      const parts = [
        addr.village ?? addr.suburb ?? addr.neighbourhood ?? addr.hamlet,
        addr.town ?? addr.city ?? addr.municipality ?? 'Bocaue',
        addr.state ?? 'Bulacan',
      ].filter(Boolean);
      return {
        formatted_address: parts.join(', ') || null,
        barangay: addr.village ?? addr.suburb ?? addr.neighbourhood ?? null,
        municipality: addr.town ?? addr.city ?? 'Bocaue',
        province: addr.state ?? 'Bulacan',
        raw: response.data,
      };
    } catch (err) {
      this.logger.warn(`Geocoding failed for ${lat},${lng}: ${String(err)}`);
      return { formatted_address: null, barangay: null, municipality: 'Bocaue', province: 'Bulacan' };
    }
  }

VERIFY:
- GET /api/v1/locations/geocode?lat=14.7961&lng=120.9252 (Bocaue coordinates)
- Should return { formatted_address: "..., Bocaue, Bulacan", barangay: "...", ... }
- With invalid coordinates (0, 0): should return { formatted_address: null, ... } — NOT a crash
```

---

## SESSION 9 — Dispatch Contact Notification

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Enqueue push and emergency-contact SMS notifications when a dispatch is created.

PREREQUISITE: SESSION 1 (queue wiring), SESSION 3 (push notification processor).

CONTEXT:
- DispatchService.create() at backend/src/dispatch/dispatch.service.ts creates the dispatch record
- After dispatch is created, the citizen reporter should receive a PUSH notification "Help is on the way"
- The citizen's emergency contacts should also receive an SMS
- The notification processing is already handled by SESSION 3's NotificationProcessor
- CRITICAL RULE: Notification failure must NEVER affect the dispatch record or its return value

READ THESE FILES FIRST:
1. backend/src/dispatch/dispatch.service.ts (find the create() method and its return value)
2. backend/src/dispatch/dispatch.module.ts

CHANGES TO MAKE:

FILE 1: backend/src/dispatch/dispatch.module.ts
- Import BullModule and QUEUE_NAMES:
  import { BullModule } from '@nestjs/bullmq'; import { QUEUE_NAMES } from '@agap/shared';
- Add to imports: BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS })

FILE 2: backend/src/dispatch/dispatch.service.ts
- Add imports: import { InjectQueue } from '@nestjs/bullmq'; import { Queue } from 'bullmq'; import { QUEUE_NAMES } from '@agap/shared';
- Add @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue to constructor

- In create(), after the dispatch DB record is saved and BEFORE the return statement, add:

  try {
    // Push to reporter
    if (incident.incident_reporters?.[0]?.user_id) {
      await this.notificationQueue.add('dispatch-created-push', {
        userId: incident.incident_reporters[0].user_id,
        channel: 'PUSH',
        title: 'Help is on the way',
        body: `Responders have been dispatched. Ref: ${incident.public_reference}`,
        data: { incidentId: incident.id, type: 'DISPATCH_CREATED' },
      });
    }
    // Emergency contacts SMS
    if (incident.incident_reporters?.[0]?.user_id) {
      await this.notificationQueue.add('dispatch-contact-notify', {
        userId: incident.incident_reporters[0].user_id,
        channel: 'EMERGENCY_CONTACTS',
        body: `AGAP: Emergency responders dispatched for ${incident.public_reference}. Help is on the way.`,
      });
    }
  } catch (err) {
    this.logger.error(`Dispatch notification failed: ${String(err)}. Dispatch unaffected.`);
  }

NOTE: Check if the create() method already loads incident_reporters in the incident query — if not, add them to the include clause when loading the incident.

VERIFY:
- POST /api/v1/dispatch with a valid incidentId and resourceId
- Check notifications queue in Redis: redis-cli KEYS "bull:notifications:*"
- Backend logs should show "Processing notification job" with channel=PUSH
```

---

## SESSION 10 — Rate Limiting on Public Endpoints

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Add throttle rate limiting to authentication and SOS endpoints to prevent abuse.

PREREQUISITE: None (standalone security hardening).

CONTEXT:
- The SOS endpoint (POST /api/v1/emergency-alerts/sos) is publicly accessible and must be protected
- Auth endpoints (register, login, forgot-password) should be throttled to prevent brute force
- @nestjs/throttler may or may not already be installed — check backend/package.json first
- The AppModule is at backend/src/app.module.ts
- Auth controller is at backend/src/auth/auth.controller.ts
- Emergency alerts controller is at backend/src/emergency-alerts/emergency-alerts.controller.ts

READ THESE FILES FIRST:
1. backend/package.json (check if @nestjs/throttler is installed)
2. backend/src/app.module.ts
3. backend/src/auth/auth.controller.ts (find register, login, forgotPassword method decorators)
4. backend/src/emergency-alerts/emergency-alerts.controller.ts (find sos and shake handlers)

CHANGES TO MAKE:

IF @nestjs/throttler NOT in package.json:
  pnpm --filter @agap/backend add @nestjs/throttler

FILE 1: backend/src/app.module.ts
- Add imports: import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'; import { APP_GUARD } from '@nestjs/core';
- Add to imports array:
  ThrottlerModule.forRoot([
    { name: 'burst', ttl: 1000, limit: 5 },
    { name: 'sustained', ttl: 60000, limit: 30 },
  ])
- Add to providers array: { provide: APP_GUARD, useClass: ThrottlerGuard }
  (This applies throttling globally; individual controllers can override with @Throttle decorator)

FILE 2: backend/src/auth/auth.controller.ts
- Add @SkipThrottle() at CLASS level if you want to only throttle specific endpoints, OR
- Add @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } }) on these methods:
  - register()
  - login()
  - forgotPassword()
  - resetPassword()
  - loginPhone() (OTP request)

FILE 3: backend/src/emergency-alerts/emergency-alerts.controller.ts
- Add custom throttle on SOS and shake handlers (stricter limits — 1 trigger per second, 10 per minute):
  @Throttle({ burst: { ttl: 1000, limit: 1 }, sustained: { ttl: 60000, limit: 10 } })
  on the sos() and shake() handlers

VERIFY:
- POST /api/v1/auth/login 6 times in quick succession → 6th should return 429 Too Many Requests
- POST /api/v1/emergency-alerts/sos twice within 1 second → 2nd should return 429
- Normal usage (1 request per few seconds) should work without errors
```

---

## SESSION 11 — Media/File Upload: Object Storage

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Implement incident photo upload using S3-compatible object storage (MinIO for dev, production bucket for prod).

PREREQUISITE: MinIO running locally (add to docker-compose.yml if not present).

CONTEXT:
- The media service stub is at backend/src/media/media.service.ts
- The incidents controller has POST /:id/attachments route at backend/src/incidents/incidents.controller.ts
- Use @aws-sdk/client-s3 for S3-compatible storage
- Use multer for file parsing in the controller
- Max file size: 10MB (10,485,760 bytes)
- Allowed MIME types: image/jpeg, image/png, image/webp, video/mp4
- File key pattern: incidents/{incidentId}/{uuid}.{ext}
- After upload: save record to incident_attachments table in DB (check schema.prisma for exact model name/fields)

READ THESE FILES FIRST:
1. backend/src/media/media.service.ts
2. backend/src/incidents/incidents.controller.ts (find the attachments endpoint)
3. backend/prisma/schema.prisma (search 'attachment' for the model and its fields)
4. docker-compose.yml (check if MinIO service exists)

INSTALL DEPENDENCIES:
  pnpm --filter @agap/backend add @aws-sdk/client-s3 multer @types/multer uuid @types/uuid

CHANGES TO MAKE:

FILE 1: docker-compose.yml (if MinIO not present)
- Add minio service:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: agap
      MINIO_ROOT_PASSWORD: agap_secret
    volumes:
      - minio_data:/data

- Add minio_data to volumes section

FILE 2: backend/src/media/media.service.ts
- Full implementation using S3Client from @aws-sdk/client-s3
- Inject ConfigService and PrismaService
- Implement uploadIncidentPhoto(file: Express.Multer.File, incidentId: string, userId: string):
  1. Validate MIME type (throw BadRequestException if invalid)
  2. Validate size (throw BadRequestException if > 10MB)
  3. Generate key: `incidents/${incidentId}/${randomUUID()}.${ext}`
  4. Create S3Client with endpoint, credentials from ConfigService
  5. PutObjectCommand with Bucket, Key, Body: file.buffer, ContentType: file.mimetype
  6. Construct public URL: `${STORAGE_ENDPOINT}/${STORAGE_BUCKET}/${key}`
  7. Save to incident_attachments table using PrismaService (use exact field names from schema.prisma)
  8. Return the attachment record

FILE 3: backend/src/incidents/incidents.controller.ts
- Find the POST /:id/attachments handler
- Add: @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_485_760 } }))
- Add parameter: @UploadedFile() file: Express.Multer.File
- Call mediaService.uploadIncidentPhoto(file, id, req.user.sub)
- Import FileInterceptor and UploadedFile from @nestjs/platform-express and @nestjs/common

ENV VARS — add to backend/.env:
  STORAGE_ENDPOINT=http://localhost:9000
  STORAGE_BUCKET=agap-media
  STORAGE_ACCESS_KEY=agap
  STORAGE_SECRET_KEY=agap_secret
  STORAGE_REGION=us-east-1

VERIFY:
- docker compose up -d minio
- Open MinIO console at http://localhost:9001 (login: agap/agap_secret) → create bucket 'agap-media'
- POST /api/v1/incidents/:id/attachments with multipart form-data file field
- Response should include attachment URL pointing to MinIO
- File should appear in MinIO console under agap-media/incidents/
```

---

## SESSION 12 — Announcements SMS Broadcast

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Wire the announcement publish action to broadcast SMS to all subscribed phone numbers via the Textbee SMS queue.

PREREQUISITE: SESSION 2 (SMS processor) must be complete.

CONTEXT:
- AnnouncementsService is at backend/src/announcements/announcements.service.ts
- The publish() method already sets status to PUBLISHED in DB
- announcement_subscriptions table stores subscribers (check schema.prisma for exact model name and fields)
- SMS payload must be under 160 chars: "AGAP: {title}. {truncated body}. Reply STOP to opt out."
- MOD-53 rule: Announcements are ONE-WAY BROADCAST ONLY — never emergency dispatch

READ THESE FILES FIRST:
1. backend/src/announcements/announcements.service.ts (find publish() method)
2. backend/src/announcements/announcements.module.ts
3. backend/prisma/schema.prisma (search 'announcement_subscription' for field names)

CHANGES TO MAKE:

FILE 1: backend/src/announcements/announcements.module.ts
- Import BullModule: import { BullModule } from '@nestjs/bullmq'; import { QUEUE_NAMES } from '@agap/shared';
- Add to imports: BullModule.registerQueue({ name: QUEUE_NAMES.SMS })

FILE 2: backend/src/announcements/announcements.service.ts
- Add imports: import { InjectQueue } from '@nestjs/bullmq'; import { Queue } from 'bullmq'; import { QUEUE_NAMES } from '@agap/shared';
- Add @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue to constructor

- In publish() method, after updating status to 'PUBLISHED', add:

  try {
    const subscribers = await this.prisma.announcement_subscriptions.findMany({
      where: { is_active: true },
      select: { phone_number: true },
    });

    const MAX_BODY_LEN = 130;
    const title = announcement.title.slice(0, 50);
    const body = (announcement.content ?? '').slice(0, MAX_BODY_LEN);
    const smsText = `AGAP: ${title}. ${body}. Reply STOP to opt out.`.slice(0, 160);

    const BATCH_SIZE = 100;
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((sub) =>
          this.smsQueue.add('announcement-sms', {
            phone: sub.phone_number,
            message: smsText,
          }),
        ),
      );
    }

    await this.prisma.announcements.update({
      where: { id: announcement.id },
      data: { sms_sent_count: subscribers.length },
    });
  } catch (err) {
    this.logger.error(`Announcement SMS broadcast failed: ${String(err)}`);
  }

NOTE: Adjust model/field names to match what you find in schema.prisma.
NOTE: If sms_sent_count field doesn't exist in the announcements model, skip that update.

VERIFY:
- POST /api/v1/announcements/:id/publish
- Check SMS queue in Redis: redis-cli LLEN bull:sms:wait
- Backend logs should show SMS jobs enqueued for each subscriber
- The announcement status in DB should be 'PUBLISHED'
```

---

## SESSION 13 — OTP Phone Login

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Implement phone OTP login. Currently POST /api/v1/auth/login/phone returns a stub message. Wire it to generate a real OTP and deliver it via Textbee SMS.

PREREQUISITE: SESSION 2 (SMS processor) must be complete.

CONTEXT:
- Auth service is at backend/src/auth/auth.service.ts
- The loginPhone() method currently returns { message: 'Phone login not yet enabled' }
- Check schema.prisma for user_verifications table (stores OTPs) — exact model and field names needed
- OTP: 6-digit numeric code, expires in 10 minutes
- Security: Do NOT reveal whether a phone number has an account — return same success message either way
- The verify OTP endpoint (POST /auth/verify/phone) may already exist — check auth.controller.ts and auth.service.ts

READ THESE FILES FIRST:
1. backend/src/auth/auth.service.ts (full file — find loginPhone() and any verifyPhone/OTP method)
2. backend/src/auth/auth.controller.ts (find loginPhone route and verify route)
3. backend/prisma/schema.prisma (search 'verification' or 'otp' for the verification model)
4. backend/src/auth/auth.module.ts (check what's injected)

CHANGES TO MAKE:

FILE 1: backend/src/auth/auth.module.ts
- Add BullModule.registerQueue({ name: QUEUE_NAMES.SMS }) to imports if not present

FILE 2: backend/src/auth/auth.service.ts
- Add @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue to constructor
- Replace the stub loginPhone() body with:

  async loginPhone(phoneNumber: string) {
    // Find user — intentionally don't expose whether account exists
    const user = await this.prisma.users.findFirst({
      where: { phone_number: phoneNumber },
    });

    if (user) {
      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Save OTP to user_verifications (adjust model name from schema.prisma)
      await this.prisma.user_verifications.upsert({
        where: { user_id_type: { user_id: user.id, type: 'PHONE_OTP' } },
        create: { user_id: user.id, code: otp, type: 'PHONE_OTP', expires_at: expiresAt, is_used: false },
        update: { code: otp, expires_at: expiresAt, is_used: false },
      });

      // Enqueue SMS
      await this.smsQueue.add('otp-sms', {
        phone: phoneNumber,
        message: `Your AGAP login code is ${otp}. Expires in 10 minutes. Do not share this code.`,
      });
    }

    // Always return same response — never reveal account existence
    return { message: 'If this number is registered, an OTP has been sent.' };
  }

NOTE: The upsert where clause depends on schema.prisma — adjust the unique constraint field to match.
NOTE: If user_verifications model uses different field names, adjust accordingly.

- If a verifyPhoneOtp() method doesn't exist yet in auth.service.ts, implement it:

  async verifyPhoneOtp(phoneNumber: string, code: string) {
    const user = await this.prisma.users.findFirst({ where: { phone_number: phoneNumber } });
    if (!user) throw new UnauthorizedException('Invalid OTP');

    const verification = await this.prisma.user_verifications.findFirst({
      where: { user_id: user.id, type: 'PHONE_OTP', code, is_used: false, expires_at: { gt: new Date() } },
    });
    if (!verification) throw new UnauthorizedException('Invalid or expired OTP');

    // Mark as used
    await this.prisma.user_verifications.update({
      where: { id: verification.id },
      data: { is_used: true },
    });

    return this.generateTokens(user);
  }

VERIFY:
- POST /api/v1/auth/login/phone with { phoneNumber: '+639XXXXXXXXX' }
  - With unregistered number: returns { message: 'If this number is registered...' } — no error, no SMS
  - With registered number: returns same message, SMS job enqueued in Redis
- POST /api/v1/auth/verify/phone with { phoneNumber, code } → returns accessToken + refreshToken
- Expired/used OTP: returns 401 Unauthorized
```

---

## SESSION 14 — Offline Sync Processor

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Implement the offline sync BullMQ processor that replays queued events from mobile clients that were offline during an emergency.

PREREQUISITE: Sessions 1–5 must be complete (full incident pipeline must work before replaying events through it).

CONTEXT:
- Offline sync processor stub: backend/src/jobs/processors/offline-sync.processor.ts
- Offline sync service: backend/src/offline-sync/offline-sync.service.ts
- Mobile clients assign client_event_id (UUID) at trigger time — backend must deduplicate
- Deduplication for SOS is already in EmergencyAlertsService.createFromSos() (checks client_event_id before insert)
- Job data shape: { events: Array<{ client_event_id: string; type: 'SOS' | 'LOCATION_UPDATE' | 'STATUS_UPDATE'; payload: any }> }
- On per-event failure: log and continue — never abort the full batch

READ THESE FILES FIRST:
1. backend/src/jobs/processors/offline-sync.processor.ts
2. backend/src/offline-sync/offline-sync.service.ts
3. backend/src/emergency-alerts/emergency-alerts.service.ts (check createFromSos signature)
4. backend/src/locations/locations.service.ts (check trackResponder signature)

CHANGES TO MAKE:

FILE 1: backend/src/jobs/processors/offline-sync.processor.ts
- Inject EmergencyAlertsService, LocationsService
- Implement process(job) method:

  async process(job: Job): Promise<{ processed: number; failed: number }> {
    const events: Array<{ client_event_id: string; type: string; payload: any }> = job.data.events ?? [];
    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        switch (event.type) {
          case 'SOS':
            await this.emergencyAlertsService.createFromSos(
              { ...event.payload, clientEventId: event.client_event_id },
              'SOS_BUTTON',
              event.payload.userId ?? undefined,
            );
            break;
          case 'LOCATION_UPDATE':
            await this.locationsService.trackResponder(event.payload, event.payload.userId);
            break;
          case 'STATUS_UPDATE':
            // Status updates from mobile are read-only views — skip in offline sync
            this.logger.log(`STATUS_UPDATE event skipped in offline sync: ${event.client_event_id}`);
            break;
          default:
            this.logger.warn(`Unknown offline event type: ${event.type}`);
        }
        processed++;
      } catch (err) {
        this.logger.error(`Offline event failed (${event.type}/${event.client_event_id}): ${String(err)}`);
        failed++;
      }
    }

    this.logger.log(`Offline sync complete: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }

FILE 2: backend/src/jobs/jobs.module.ts
- Import EmergencyAlertsModule and LocationsModule if not already:
  import { EmergencyAlertsModule } from '../emergency-alerts/emergency-alerts.module';
  import { LocationsModule } from '../locations/locations.module';
- Add them to imports array
- Check if EmergencyAlertsModule and LocationsModule export their services — if not, add exports: [...Service] to those modules

VERIFY:
- POST /api/v1/offline-sync/flush with body:
  { events: [{ client_event_id: 'uuid-here', type: 'SOS', payload: { incidentType: 'MEDICAL', latitude: 14.7961, longitude: 120.9252, reporterPhone: '+639XXXXXXXXX' } }] }
- Check backend logs: "Offline sync complete: 1 processed, 0 failed"
- Check DB: incident with that client_event_id should exist
- Submit same event again (same client_event_id) → logs "Idempotent SOS for {id}: {incidentId}" — no duplicate created
```

---

## SESSION 15 — Analytics Aggregation Cron

```
You are working on AGAP — a GPS-Based Emergency Alert System (NestJS + BullMQ + Prisma + PostgreSQL).
The repo is a pnpm monorepo at agap-emergency/. All backend code is under backend/src/.

TASK: Implement the analytics BullMQ processor and schedule it as a daily cron job to aggregate incident response metrics.

PREREQUISITE: Sessions 1–9 should be complete so real incident data is flowing.

CONTEXT:
- Analytics processor stub: backend/src/jobs/processors/analytics.processor.ts
- Analytics service (on-demand computation): backend/src/analytics/analytics.service.ts
- The analytics service already computes metrics on-demand from live incident tables
- This session adds a daily cron that pre-aggregates yesterday's data for faster dashboard load
- @nestjs/schedule may or may not be installed — check backend/package.json

READ THESE FILES FIRST:
1. backend/src/jobs/processors/analytics.processor.ts
2. backend/src/analytics/analytics.service.ts (understand what it already computes)
3. backend/prisma/schema.prisma (search 'analytics' or 'snapshot' for any summary table)
4. backend/package.json (check @nestjs/schedule)

INSTALL IF NEEDED:
  pnpm --filter @agap/backend add @nestjs/schedule

CHANGES TO MAKE:

FILE 1: backend/src/jobs/processors/analytics.processor.ts
- Inject PrismaService and AnalyticsService
- Implement process(job) for 'daily-summary' job type:

  async process(job: Job): Promise<void> {
    if (job.name !== 'daily-summary') return;
    this.logger.log('Running daily analytics aggregation');
    try {
      // Compute metrics for yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const todayMidnight = new Date(yesterday);
      todayMidnight.setDate(todayMidnight.getDate() + 1);

      const incidents = await this.prisma.incident.findMany({
        where: { created_at: { gte: yesterday, lt: todayMidnight } },
        include: { incident_events: true },
      });

      const totalCount = incidents.length;
      const falseAlerts = incidents.filter((i) => i.status === 'FALSE_ALERT').length;
      const byCategory = incidents.reduce((acc, i) => {
        acc[i.category] = (acc[i.category] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      this.logger.log(`Analytics: ${yesterday.toDateString()} — ${totalCount} incidents, ${falseAlerts} false alerts, by category: ${JSON.stringify(byCategory)}`);

      // If an analytics_snapshots table exists in schema.prisma, upsert here
      // Otherwise, logging is sufficient — analytics.service.ts computes on-demand anyway
    } catch (err) {
      this.logger.error(`Analytics aggregation failed: ${String(err)}`);
    }
  }

FILE 2: backend/src/jobs/jobs.module.ts
- Import ScheduleModule: import { ScheduleModule } from '@nestjs/schedule';
- Import AnalyticsModule or AnalyticsService
- Add ScheduleModule.forRoot() to imports array
- Add a provider for the cron scheduler:

  Create backend/src/jobs/analytics-cron.service.ts:
  import { Injectable, Logger } from '@nestjs/common';
  import { Cron, CronExpression } from '@nestjs/schedule';
  import { InjectQueue } from '@nestjs/bullmq';
  import { Queue } from 'bullmq';
  import { QUEUE_NAMES } from '@agap/shared';

  @Injectable()
  export class AnalyticsCronService {
    private readonly logger = new Logger(AnalyticsCronService.name);

    constructor(@InjectQueue(QUEUE_NAMES.ANALYTICS_AGGREGATION) private readonly analyticsQueue: Queue) {}

    @Cron('0 1 * * *')  // 1am daily
    async scheduleDailySummary() {
      this.logger.log('Scheduling daily analytics aggregation');
      await this.analyticsQueue.add('daily-summary', { triggeredAt: new Date().toISOString() });
    }
  }

- Add AnalyticsCronService to providers in JobsModule
- Add BullModule.registerQueue({ name: QUEUE_NAMES.ANALYTICS_AGGREGATION }) if not present

VERIFY:
- Temporarily change @Cron to run every minute: '* * * * *'
- Wait 1 minute → check backend logs for "Running daily analytics aggregation"
- Check output: shows correct count of incidents from yesterday
- Change back to '0 1 * * *' after verification
```

---

## COMPLETION CHECKLIST

| Session | Task | Status |
|---|---|---|
| SESSION 1 | Wire SOS/Shake to Job Queues | ⬜ |
| SESSION 2 | SMS Processor — Textbee.dev | ⬜ |
| SESSION 3 | Push Processor — Firebase FCM | ⬜ |
| SESSION 4 | WebSocket Auth Guard | ⬜ |
| SESSION 5 | Realtime Emits: Location + Dispatch | ⬜ |
| SESSION 6 | SLA Monitor Processor | ⬜ |
| SESSION 7 | ETA Calculation: Routing API | ⬜ |
| SESSION 8 | Reverse Geocoding | ⬜ |
| SESSION 9 | Dispatch Contact Notification | ⬜ |
| SESSION 10 | Rate Limiting on Public Endpoints | ⬜ |
| SESSION 11 | Media/File Upload: Object Storage | ⬜ |
| SESSION 12 | Announcements SMS Broadcast | ⬜ |
| SESSION 13 | OTP Phone Login | ⬜ |
| SESSION 14 | Offline Sync Processor | ⬜ |
| SESSION 15 | Analytics Aggregation Cron | ⬜ |

**After SESSION 1–3:** First real SMS + push notification fired from an SOS trigger.  
**After SESSION 4–5:** Live map works with authenticated WebSocket + real-time location/dispatch events.  
**After SESSION 6–9:** Full dispatch coordination loop — SLA escalation, ETA, citizen + contact notifications.  
**After SESSION 10–11:** Pre-production hardening — rate limits + photo evidence upload.  
**After SESSION 12–15:** Complete feature set — announcements broadcast, phone OTP login, offline sync, analytics cron.
