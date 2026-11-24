import axios from 'axios';
import { SmsProcessor } from '../../src/jobs/processors/sms.processor';
import { phoneLast4, scrubSmsError, smsKindForJob } from '../../src/notifications/sms/sms-log';
import { SmsActivityService } from '../../src/administration/sms-activity.service';
import { configValueProblem, isHiddenConfigKey } from '../../src/administration/config-registry';
import { smsLogRetentionDays } from '../../src/jobs/sms-log-retention.service';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return { __esModule: true, default: { ...actual, post: jest.fn(), get: jest.fn(), isAxiosError: actual.isAxiosError } };
});
const post = axios.post as jest.Mock;

const INCIDENT = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';

function makeProcessor(config: Record<string, string> = { TEXTBEE_API_KEY: 'tb_live_secretsecretsecretsecret', TEXTBEE_DEVICE_ID: 'dev1' }) {
  const create = jest.fn().mockResolvedValue({});
  const prisma = { sms_log: { create } };
  const processor = new SmsProcessor({ get: (k: string) => config[k] } as any, undefined, undefined, prisma as any);
  return { processor, create };
}

function job(name: string, data: Record<string, unknown>, attemptsMade = 0) {
  return { id: '1', name, data, attemptsMade, opts: { attempts: 3 } } as any;
}

describe('outbound SMS log (MOD-17 tracking)', () => {
  beforeEach(() => post.mockReset());

  it('logs an accepted SMS with kind, last 4 digits and length, never the text', async () => {
    post.mockResolvedValue({ data: { data: { smsBatchId: 'b1' } } });
    const { processor, create } = makeProcessor();
    await processor.process(job('otp-sms', { phone: '+639171234567', message: 'Your AGAP code is 482913' }));

    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0].data;
    expect(row).toEqual(expect.objectContaining({
      kind: 'AUTH', job_name: 'otp-sms', recipient_last4: '4567', status: 'ACCEPTED',
      gateway_status: null, error: null, attempt: 1, chars: 24, incident_id: null,
    }));
    expect(JSON.stringify(row)).not.toContain('482913');
    expect(JSON.stringify(row)).not.toContain('917123');
  });

  it('logs a gateway refusal with the HTTP status and no API key', async () => {
    const err = Object.assign(new Error('Request failed'), {
      isAxiosError: true, code: 'ERR_BAD_REQUEST', response: { status: 401 },
      config: { headers: { 'x-api-key': 'tb_live_secretsecretsecretsecret' } },
    });
    post.mockRejectedValue(err);
    const { processor, create } = makeProcessor();
    await processor.process(job('emergency-sms', { phone: '09170000001', message: 'AGAP|INC', incidentId: INCIDENT }));

    const row = create.mock.calls[0][0].data;
    expect(row).toEqual(expect.objectContaining({ kind: 'OPS_ALERT', status: 'FAILED', gateway_status: 401, incident_id: INCIDENT }));
    expect(JSON.stringify(row)).not.toContain('secret');
  });

  it('logs NOT_CONFIGURED when the gateway keys are missing', async () => {
    const { processor, create } = makeProcessor({});
    await processor.process(job('contact-alert', { phone: '09170000001', message: 'x' }));
    expect(create.mock.calls[0][0].data).toEqual(expect.objectContaining({ kind: 'CONTACT_ALERT', status: 'NOT_CONFIGURED' }));
    expect(post).not.toHaveBeenCalled();
  });

  it('records the attempt number of a retried critical SMS', async () => {
    post.mockResolvedValue({ data: {} });
    const { processor, create } = makeProcessor();
    await processor.process(job('barangay-followup-sms', { phone: '09170000001', message: 'x', critical: true }, 2));
    expect(create.mock.calls[0][0].data).toEqual(expect.objectContaining({ kind: 'BARANGAY_ALERT', attempt: 3 }));
  });

  it('never fails the SMS when the log write fails', async () => {
    post.mockResolvedValue({ data: {} });
    const { processor, create } = makeProcessor();
    create.mockRejectedValue(new Error('relation "sms_log" does not exist'));
    await expect(processor.process(job('citizen-sos-reply', { phone: '09170000001', message: 'x' }))).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('maps job names to kinds and masks safely', () => {
    expect(smsKindForJob('announcement-sms')).toBe('ANNOUNCEMENT');
    expect(smsKindForJob('something-new', { noticeId: 'n' })).toBe('BARANGAY_ALERT');
    expect(smsKindForJob(undefined)).toBe('OTHER');
    expect(phoneLast4('12')).toBeNull();
    expect(phoneLast4('+63 917 555 0199')).toBe('0199');
    expect(scrubSmsError('HTTP 500 to +639171234567 key abcdefghijklmnopqrstuvwxyz1234')).toBe('HTTP 500 to [number] key [redacted]');
  });
});

describe('SMS activity endpoint', () => {
  function makeService(rows: unknown[] = [], total = 0) {
    const prisma = {
      sms_log: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(total),
      },
    };
    return { service: new SmsActivityService(prisma as any), prisma };
  }

  it('pages newest first, caps perPage and hides the incident ID', async () => {
    const row = {
      id: 'r1', kind: 'OPS_ALERT', status: 'ACCEPTED', recipient_last4: '0001', gateway_status: null, error: null,
      attempt: 1, chars: 58, duration_ms: 320, incident_id: INCIDENT, created_at: new Date('2026-11-24T03:00:00Z'),
    };
    const { service, prisma } = makeService([row], 250);
    const res = await service.list({ page: 3, perPage: 500, status: 'ACCEPTED', kind: 'OPS_ALERT' });

    expect(prisma.sms_log.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'ACCEPTED', kind: 'OPS_ALERT' }, orderBy: { created_at: 'desc' }, skip: 200, take: 100,
    }));
    expect(res.meta).toEqual({ total: 250, page: 3, perPage: 100, totalPages: 3 });
    expect(res.data[0]).toEqual(expect.objectContaining({ hasIncident: true, createdAt: '2026-11-24T03:00:00.000Z' }));
    expect(JSON.stringify(res)).not.toContain(INCIDENT);
  });

  it('includes the whole "to" day and refuses unknown filters', async () => {
    const { service, prisma } = makeService();
    await service.list({ from: '2026-11-20', to: '2026-11-24' });
    const where = prisma.sms_log.findMany.mock.calls[0][0].where;
    expect(where.created_at.lte.toISOString()).toBe('2026-11-24T23:59:59.999Z');
    await expect(service.list({ status: 'DELIVERED' })).rejects.toThrow('Unknown status');
    await expect(service.list({ kind: 'SPAM' })).rejects.toThrow('Unknown kind');
  });
});

describe('Configuration registry', () => {
  it('hides push tokens and job bookkeeping', () => {
    expect(isHiddenConfigKey('fcm_token:3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b')).toBe(true);
    expect(isHiddenConfigKey('risk.hotspot_check.last_run')).toBe(true);
    expect(isHiddenConfigKey('oversight.waiting_minutes')).toBe(false);
  });

  it('checks known keys by type and range', () => {
    expect(configValueProblem('oversight.waiting_minutes', 7)).toBeNull();
    expect(configValueProblem('oversight.waiting_minutes', '7')).toBeNull();
    expect(configValueProblem('oversight.waiting_minutes', 0)).toMatch(/at least 1 minutes/);
    expect(configValueProblem('oversight.waiting_minutes', 'soon')).toMatch(/must be a number/);
    expect(configValueProblem('sms_enabled', 'yes')).toMatch(/true or false/);
    expect(configValueProblem('custom.key', { any: 'json' })).toBeNull();
  });

  it('keeps the SMS log retention within 7–730 days', () => {
    expect(smsLogRetentionDays(undefined)).toBe(90);
    expect(smsLogRetentionDays('30')).toBe(30);
    expect(smsLogRetentionDays('3')).toBe(90);
    expect(smsLogRetentionDays('abc')).toBe(90);
  });
});
