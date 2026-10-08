import { CommunicationsService } from '../../src/communications/communications.service';
import { ForbiddenException } from '@nestjs/common';

const REPORTER = 'user-reporter';
const CREW = 'user-crew';
const DISPATCHER = 'user-dispatcher';
const STRANGER = 'user-stranger';
const INCIDENT = 'inc-1';

function buildPrisma() {
  return {
    incidentReporter: {
      findUnique: jest.fn().mockResolvedValue({ user_id: REPORTER }),
    },
    dispatch_crew: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.user_id === CREW ? { id: 'dc-1' } : null),
      ),
      count: jest.fn().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        const roles: Record<string, string> = {
          [REPORTER]: 'CITIZEN',
          [CREW]: 'RESPONDER',
          [DISPATCHER]: 'DISPATCHER',
          [STRANGER]: 'CITIZEN',
        };
        return Promise.resolve(roles[where.id] ? { role: roles[where.id] } : null);
      }),
      findMany: jest.fn().mockResolvedValue([
        { id: REPORTER, role: 'CITIZEN' },
        { id: DISPATCHER, role: 'DISPATCHER' },
      ]),
    },
    incident_messages: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    message_reads: { upsert: jest.fn().mockResolvedValue({}) },
  };
}

describe('CommunicationsService — participants-only (MOD-33)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  const realtime = { messageCreated: jest.fn() };

  function service() {
    return new CommunicationsService(prisma as any, realtime as any);
  }

  beforeEach(() => {
    prisma = buildPrisma();
    jest.clearAllMocks();
  });

  describe('assertParticipant', () => {
    it('allows the reporter', async () => {
      await expect(service().assertParticipant(INCIDENT, REPORTER)).resolves.toEqual({ role: 'CITIZEN' });
    });

    it('allows an assigned responder (dispatch crew)', async () => {
      await expect(service().assertParticipant(INCIDENT, CREW)).resolves.toEqual({ role: 'RESPONDER' });
    });

    it('allows operational staff (dispatcher)', async () => {
      await expect(service().assertParticipant(INCIDENT, DISPATCHER)).resolves.toEqual({ role: 'DISPATCHER' });
    });

    it('blocks a non-participant stranger', async () => {
      await expect(service().assertParticipant(INCIDENT, STRANGER)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('sendMessage', () => {
    it('blocks a non-participant from sending', async () => {
      await expect(
        service().sendMessage(INCIDENT, { messageText: 'hi' }, STRANGER),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.incident_messages.create).not.toHaveBeenCalled();
      expect(realtime.messageCreated).not.toHaveBeenCalled();
    });

    it('persists + emits message.created to the incident room with a role label (no name)', async () => {
      prisma.incident_messages.create.mockResolvedValue({
        id: 'msg-1',
        incident_id: INCIDENT,
        sender_id: DISPATCHER,
        message_text: 'Unit dispatched',
        attachment_id: null,
        sent_at: new Date('2026-10-08T10:00:00Z'),
      });

      const result = await service().sendMessage(INCIDENT, { messageText: 'Unit dispatched' }, DISPATCHER);

      expect(result.sender_label).toBe('Dispatcher');
      expect(result).not.toHaveProperty('sender_name');
      expect(realtime.messageCreated).toHaveBeenCalledWith(
        INCIDENT,
        expect.objectContaining({ id: 'msg-1', senderLabel: 'Dispatcher', senderId: DISPATCHER }),
      );
    });

    it("labels the reporter's own message 'Reporter' — never the bystander's identity (rule 15)", async () => {
      prisma.incident_messages.create.mockResolvedValue({
        id: 'msg-2',
        incident_id: INCIDENT,
        sender_id: REPORTER,
        message_text: 'We are near the bridge',
        attachment_id: null,
        sent_at: new Date('2026-10-08T10:01:00Z'),
      });

      const result = await service().sendMessage(INCIDENT, { messageText: 'We are near the bridge' }, REPORTER);
      expect(result.sender_label).toBe('Reporter');
      expect(result.sender_role).toBe('REPORTER');
    });
  });

  describe('getMessages', () => {
    it('blocks a non-participant from reading', async () => {
      await expect(service().getMessages(INCIDENT, STRANGER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns messages with role labels and no personal identity fields', async () => {
      prisma.incident_messages.findMany.mockResolvedValue([
        { id: 'm1', incident_id: INCIDENT, sender_id: REPORTER, message_text: 'help', attachment_id: null, sent_at: new Date() },
        { id: 'm2', incident_id: INCIDENT, sender_id: DISPATCHER, message_text: 'on the way', attachment_id: null, sent_at: new Date() },
      ]);

      const msgs = await service().getMessages(INCIDENT, DISPATCHER);
      expect(msgs[0]!.sender_label).toBe('Reporter');
      expect(msgs[1]!.sender_label).toBe('Dispatcher');
      expect(Object.keys(msgs[0]!)).not.toContain('sender_name');
    });
  });
});
