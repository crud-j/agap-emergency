import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { AiSuggestionsService } from '../../src/ai-assist/ai-suggestions.service';
import { AiSuggestionsController } from '../../src/ai-assist/ai-suggestions.controller';
import {
  BarangayCallbackRefusedError,
  BarangayCallbackService,
} from '../../src/barangay-coordination/barangay-callback.service';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

/**
 * AUTOMATION_NEEDS_PLAN Phase 3 (C4): a dispatcher accepts or dismisses an AI reading.
 * Accept goes through reportBySms (the barangay's own SMS path), under the dispatcher.
 */

const DISPATCHER = { id: 'disp-1', role: 'DISPATCHER' };
const NOTICE = {
  id: 'n-1',
  incident_id: 'inc-1',
  barangay_id: 'BUNLO',
  closed_at: null,
  last_report: null,
  barangay: { id: 'BUNLO', name: 'Bunlo' },
};
const ROW = {
  id: 'sug-1',
  kind: 'BARANGAY_REPLY',
  status: 'PENDING_REVIEW',
  incident_id: 'inc-1',
  subject_type: 'barangay_sms_inbound',
  subject_id: 'in-1',
  output: { status: 'NEEDS_BACKUP', confidence: 0.91, english: 'We need a boat' },
  created_at: new Date('2026-10-30T05:00:00Z'),
};

function build(opts: { row?: any; notice?: any; claim?: number } = {}) {
  const prisma: any = {
    ai_suggestions: {
      findUnique: jest.fn().mockResolvedValue(opts.row === undefined ? ROW : opts.row),
      findMany: jest.fn().mockResolvedValue([ROW]),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claim ?? 1 }),
    },
    barangay_sms_inbound: {
      findUnique: jest.fn().mockResolvedValue({ notice_id: 'n-1' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'in-1', body: 'need po ng bangka', received_at: new Date('2026-10-30T04:59:00Z') }]),
    },
    incident_barangay_notices: { findUnique: jest.fn().mockResolvedValue(opts.notice === undefined ? NOTICE : opts.notice) },
    incident: { update: jest.fn() },
  };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  const callbacks: any = { reportBySms: jest.fn().mockResolvedValue(undefined) };
  return { service: new AiSuggestionsService(prisma, audit, callbacks), prisma, audit, callbacks };
}

describe('AiSuggestionsService.accept', () => {
  it('claims the row, records the reading through reportBySms under the dispatcher, and audits it', async () => {
    const b = build();
    await expect(b.service.accept('sug-1', DISPATCHER)).resolves.toEqual({ id: 'sug-1', status: 'ACCEPTED', recorded: 'NEEDS_BACKUP' });

    expect(b.prisma.ai_suggestions.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'sug-1', status: 'PENDING_REVIEW' },
      data: { status: 'ACCEPTED', reviewed_by_id: 'disp-1' },
    });
    expect(b.callbacks.reportBySms).toHaveBeenCalledWith(NOTICE, 'NEEDS_BACKUP', {
      actorId: 'disp-1',
      actorRole: 'DISPATCHER',
      aiSuggestionId: 'sug-1',
    });
    expect(b.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'disp-1',
        entityType: 'ai_suggestion',
        entityId: 'sug-1',
        moduleId: 'MOD-46',
        incidentId: 'inc-1',
        oldValues: { status: 'PENDING_REVIEW' },
        newValues: expect.objectContaining({ status: 'ACCEPTED', aiSuggestionId: 'sug-1' }),
      }),
    );
    // The incident itself is never written here.
    expect(b.prisma.incident.update).not.toHaveBeenCalled();
  });

  it.each([
    ['a second time (already ACCEPTED)', 'ACCEPTED'],
    ['an information-only reading', 'INFO'],
    ['a failed call', 'FAILED'],
    ['a dismissed suggestion', 'DISMISSED'],
  ])('is refused for %s, and records nothing', async (_label, status) => {
    const b = build({ row: { ...ROW, status } });
    await expect(b.service.accept('sug-1', DISPATCHER)).rejects.toThrow(ConflictException);
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
    expect(b.prisma.ai_suggestions.updateMany).not.toHaveBeenCalled();
    expect(b.audit.log).not.toHaveBeenCalled();
  });

  it('is refused when another dispatcher claimed it first', async () => {
    const b = build({ claim: 0 });
    await expect(b.service.accept('sug-1', DISPATCHER)).rejects.toThrow(ConflictException);
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
  });

  it('is refused for a closed case, before anything is claimed', async () => {
    const b = build({ notice: { ...NOTICE, closed_at: new Date() } });
    await expect(b.service.accept('sug-1', DISPATCHER)).rejects.toThrow(ConflictException);
    expect(b.prisma.ai_suggestions.updateMany).not.toHaveBeenCalled();
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
  });

  it('releases the claim when the report is refused (the case closed meanwhile)', async () => {
    const b = build();
    b.callbacks.reportBySms.mockRejectedValue(new BarangayCallbackRefusedError('This case is closed.'));
    await expect(b.service.accept('sug-1', DISPATCHER)).rejects.toThrow(ConflictException);
    expect(b.prisma.ai_suggestions.updateMany.mock.calls[1][0]).toEqual({
      where: { id: 'sug-1', status: 'ACCEPTED' },
      data: { status: 'PENDING_REVIEW', reviewed_by_id: null, reviewed_at: null },
    });
    expect(b.audit.log).not.toHaveBeenCalled();
  });

  it('404 for an unknown suggestion', async () => {
    const b = build({ row: null });
    await expect(b.service.accept('nope', DISPATCHER)).rejects.toThrow(NotFoundException);
  });
});

describe('AiSuggestionsService.dismiss', () => {
  it.each(['PENDING_REVIEW', 'INFO'])('hides a %s row, audits it, and records no report', async (status) => {
    const b = build({ row: { ...ROW, status } });
    await expect(b.service.dismiss('sug-1', DISPATCHER)).resolves.toEqual({ id: 'sug-1', status: 'DISMISSED' });
    expect(b.prisma.ai_suggestions.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'sug-1', status: { in: ['PENDING_REVIEW', 'INFO'] } },
      data: { status: 'DISMISSED', reviewed_by_id: 'disp-1' },
    });
    expect(b.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'ai_suggestion', moduleId: 'MOD-46', oldValues: { status }, newValues: expect.objectContaining({ status: 'DISMISSED' }) }),
    );
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
  });

  it('is refused once reviewed', async () => {
    const b = build({ row: { ...ROW, status: 'ACCEPTED' }, claim: 0 });
    await expect(b.service.dismiss('sug-1', DISPATCHER)).rejects.toThrow(ConflictException);
    expect(b.audit.log).not.toHaveBeenCalled();
  });
});

describe('AiSuggestionsService.listForIncident', () => {
  it('returns open rows with the barangay text and the reading', async () => {
    const b = build();
    await expect(b.service.listForIncident('inc-1')).resolves.toEqual([
      {
        id: 'sug-1',
        kind: 'BARANGAY_REPLY',
        status: 'PENDING_REVIEW',
        createdAt: '2026-10-30T05:00:00.000Z',
        reading: { status: 'NEEDS_BACKUP', confidence: 0.91, english: 'We need a boat' },
        sourceText: 'need po ng bangka',
        receivedAt: '2026-10-30T04:59:00.000Z',
      },
    ]);
    expect(b.prisma.ai_suggestions.findMany.mock.calls[0][0].where).toEqual({
      incident_id: 'inc-1',
      status: { in: ['PENDING_REVIEW', 'INFO'] },
    });
  });
});

describe('AI suggestion routes', () => {
  it('are Dispatcher and Supervisor only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AiSuggestionsController)).toEqual([UserRole.DISPATCHER, UserRole.SUPERVISOR]);
  });
});

describe('BarangayCallbackService.reportBySms with an accepted AI reading', () => {
  function buildCallbacks() {
    const prisma: any = {
      incident: { findUnique: jest.fn().mockResolvedValue({ status: 'ASSESSED', public_reference: 'INC-2026-000042' }) },
      incident_barangay_notices: { update: jest.fn().mockResolvedValue({}) },
      incidentEvent: { create: jest.fn().mockResolvedValue({}) },
      escalation: { create: jest.fn().mockResolvedValue({ id: 'esc-1' }) },
    };
    const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
    const realtime: any = { notifyEscalation: jest.fn() };
    const notify: any = { emitUpdated: jest.fn().mockResolvedValue(undefined) };
    const service = new BarangayCallbackService(prisma, audit, realtime, notify, {} as any, {} as any, {} as any);
    return { service, prisma, audit, realtime };
  }

  it('records it under the dispatcher with the suggestion ID, and NEEDS_BACKUP still escalates', async () => {
    const b = buildCallbacks();
    await b.service.reportBySms(NOTICE as any, 'NEEDS_BACKUP', { actorId: 'disp-1', actorRole: 'DISPATCHER', aiSuggestionId: 'sug-1' });

    expect(b.prisma.incident_barangay_notices.update.mock.calls[0][0].data).toMatchObject({
      last_report: 'NEEDS_BACKUP',
      last_report_source: 'SMS_REPLY',
      last_report_by_user_id: 'disp-1',
    });
    expect(b.prisma.incidentEvent.create.mock.calls[0][0].data).toMatchObject({
      triggered_by_id: 'disp-1',
      triggered_by_role: 'DISPATCHER',
      from_status: 'ASSESSED',
      to_status: 'ASSESSED',
    });
    expect(b.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'disp-1',
        entityType: 'incident_barangay_notice',
        newValues: { last_report: 'NEEDS_BACKUP', source: 'SMS_REPLY', aiSuggestionId: 'sug-1' },
      }),
    );
    expect(b.prisma.escalation.create).toHaveBeenCalledTimes(1);
    expect(b.realtime.notifyEscalation).toHaveBeenCalledWith('inc-1', expect.objectContaining({ escalationType: 'BARANGAY_BACKUP_REQUESTED' }));
  });

  it('without opts it is the barangay\'s own reply, exactly as before (no actor)', async () => {
    const b = buildCallbacks();
    await b.service.reportBySms(NOTICE as any, 'ON_SCENE');
    expect(b.prisma.incident_barangay_notices.update.mock.calls[0][0].data.last_report_by_user_id).toBeNull();
    expect(b.prisma.incidentEvent.create.mock.calls[0][0].data.triggered_by_id).toBeNull();
    const entry = b.audit.log.mock.calls[0][0];
    expect(entry).not.toHaveProperty('actorId');
    expect(entry.newValues).toEqual({ last_report: 'ON_SCENE', source: 'SMS_REPLY' });
  });
});
