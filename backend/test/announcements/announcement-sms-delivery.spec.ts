import axios from 'axios';
import { SmsProcessor } from '../../src/jobs/processors/sms.processor';

/** MOD-53: each announcement SMS records Textbee's result on its announcement_deliveries row. */

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return { __esModule: true, default: { ...actual, post: jest.fn(), get: jest.fn() }, isAxiosError: actual.isAxiosError };
});
const axiosPost = axios.post as jest.Mock;
const axiosGet = axios.get as jest.Mock;

const CHECK_JOB = 'announcement-sms-delivery-check';

function processor(env: Record<string, string> = { TEXTBEE_API_KEY: 'k', TEXTBEE_DEVICE_ID: 'd' }) {
  const config: any = { get: jest.fn((k: string) => env[k]) };
  const queue: any = { add: jest.fn().mockResolvedValue(undefined) };
  const prisma: any = { announcement_deliveries: { update: jest.fn().mockResolvedValue({}) } };
  return { proc: new SmsProcessor(config, undefined, queue, prisma), queue, update: prisma.announcement_deliveries.update };
}
const smsJob = () =>
  ({ id: 'j-1', name: 'announcement-sms', attemptsMade: 0, opts: {}, data: { phone: '+639170000001', message: 'AGAP: …', announcementDeliveryId: 'del-1' } }) as any;
const check = (polls = 0) => ({ name: CHECK_JOB, data: { deliveryId: 'del-1', batchId: 'b-1', polls } }) as any;
const messages = (...statuses: string[]) => ({ data: { data: statuses.map((status) => ({ status })) } });
const statusOf = (update: jest.Mock) => update.mock.calls.at(-1)?.[0]?.data;

beforeEach(() => {
  axiosPost.mockReset();
  axiosGet.mockReset();
});

describe('announcement SMS delivery tracking', () => {
  it('marks SENT when Textbee accepts it, then queues a delivery check', async () => {
    axiosPost.mockResolvedValue({ data: { data: { smsBatchId: 'b-1' } } });
    const { proc, queue, update } = processor();
    await proc.process(smsJob());
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'del-1' } }));
    expect(statusOf(update)).toMatchObject({ status: 'SENT', sent_at: expect.any(Date) });
    expect(queue.add).toHaveBeenCalledWith(
      CHECK_JOB,
      { deliveryId: 'del-1', batchId: 'b-1', polls: 0 },
      expect.objectContaining({ delay: expect.any(Number) }),
    );
  });

  it('marks FAILED with a reason when the gateway refuses, without throwing', async () => {
    axiosPost.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 500'), { isAxiosError: true, response: { status: 500 } }),
    );
    const { proc, queue, update } = processor();
    await expect(proc.process(smsJob())).resolves.toBeUndefined();
    expect(statusOf(update)).toMatchObject({ status: 'FAILED', failure_reason: expect.stringContaining('HTTP 500') });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('marks FAILED when Textbee is not configured', async () => {
    const { proc, update } = processor({});
    await proc.process(smsJob());
    expect(axiosPost).not.toHaveBeenCalled();
    expect(statusOf(update)).toMatchObject({ status: 'FAILED', failure_reason: 'SMS gateway not configured' });
  });

  it('marks DELIVERED when the phone confirms delivery', async () => {
    axiosGet.mockResolvedValue(messages('delivered'));
    const { proc, update } = processor();
    await proc.process(check());
    expect(statusOf(update)).toMatchObject({ status: 'DELIVERED', delivered_at: expect.any(Date) });
  });

  it('marks FAILED when the phone reports failed (no load)', async () => {
    axiosGet.mockResolvedValue(messages('failed'));
    const { proc, update } = processor();
    await proc.process(check());
    expect(statusOf(update)).toMatchObject({ status: 'FAILED', failure_reason: expect.stringContaining('gateway phone') });
  });

  it('polls again while the message is pending', async () => {
    axiosGet.mockResolvedValue(messages('pending'));
    const { proc, queue, update } = processor();
    await proc.process(check(3));
    expect(update).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(CHECK_JOB, expect.objectContaining({ polls: 4 }), expect.anything());
  });

  it('at the end of the window: sent stays SENT, still pending → FAILED', async () => {
    axiosGet.mockResolvedValue(messages('sent'));
    const a = processor();
    await a.proc.process(check(23));
    expect(a.update).not.toHaveBeenCalled();
    expect(a.queue.add).not.toHaveBeenCalled();

    axiosGet.mockResolvedValue(messages('pending'));
    const b = processor();
    await b.proc.process(check(23));
    expect(statusOf(b.update)).toMatchObject({ status: 'FAILED', failure_reason: expect.stringContaining('6 minutes') });
  });

  it('a failed database write never fails the job', async () => {
    axiosPost.mockResolvedValue({ data: {} });
    const { proc, update } = processor();
    update.mockRejectedValue(new Error('db down'));
    await expect(proc.process(smsJob())).resolves.toBeUndefined();
  });
});
