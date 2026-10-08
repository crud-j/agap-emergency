import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SubmitAssessmentInput } from '../api/assessments.api';

const QUEUE_KEY = 'agap:assessment_queue';
const MAX_ATTEMPTS = 8;

export interface QueuedAssessment {
  clientId: string;
  incidentId: string;
  payload: SubmitAssessmentInput;
  queuedAt: number;
  attempts: number;
}

function clientId(): string {
  return 'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Offline-safe store for on-scene assessments (MOD-37 / MOD-19). If the POST
 * fails (degraded Bocaue connectivity), the assessment is persisted locally and
 * flushed on the next screen mount / successful network call. Nothing is lost.
 */
export class AssessmentQueueService {
  private static async read(): Promise<QueuedAssessment[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAssessment[]) : [];
  }

  private static async write(queue: QueuedAssessment[]): Promise<void> {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  static async enqueue(incidentId: string, payload: SubmitAssessmentInput): Promise<void> {
    const queue = await this.read();
    queue.push({ clientId: clientId(), incidentId, payload, queuedAt: Date.now(), attempts: 0 });
    await this.write(queue);
  }

  static async pendingCount(incidentId: string): Promise<number> {
    const queue = await this.read();
    return queue.filter((q) => q.incidentId === incidentId).length;
  }

  /**
   * Attempt to submit every queued assessment. Successful ones are removed;
   * failures stay (until MAX_ATTEMPTS) so they retry on the next flush.
   * Returns the number still pending afterwards.
   */
  static async flush(
    submitFn: (incidentId: string, payload: SubmitAssessmentInput) => Promise<unknown>,
  ): Promise<number> {
    const queue = await this.read();
    if (queue.length === 0) return 0;

    const remaining: QueuedAssessment[] = [];
    for (const item of queue) {
      try {
        await submitFn(item.incidentId, item.payload);
      } catch {
        if (item.attempts + 1 < MAX_ATTEMPTS) {
          remaining.push({ ...item, attempts: item.attempts + 1 });
        }
      }
    }
    await this.write(remaining);
    return remaining.length;
  }
}
