import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CreateIncidentInput } from '@agap/shared';
import {
  MAX_OFFLINE_RETRY_ATTEMPTS,
  OFFLINE_RETRY_BASE_DELAY_MS,
  OFFLINE_RETRY_MAX_DELAY_MS,
} from '@agap/shared';

const QUEUE_KEY = 'agap:offline_queue';

export interface QueuedIncident {
  idempotencyKey: string;
  payload: CreateIncidentInput;
  attempts: number;
  queuedAt: number;
  lastAttemptAt: number | null;
  status: 'pending' | 'retrying' | 'failed';
}

export class OfflineQueueService {
  private static async getQueue(): Promise<QueuedIncident[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  private static async saveQueue(queue: QueuedIncident[]): Promise<void> {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  static async enqueue(payload: CreateIncidentInput): Promise<void> {
    const queue = await this.getQueue();

    const existing = queue.find((q) => q.idempotencyKey === payload.idempotencyKey);
    if (existing) return; // Already queued

    const entry: QueuedIncident = {
      idempotencyKey: payload.idempotencyKey,
      payload,
      attempts: 0,
      queuedAt: Date.now(),
      lastAttemptAt: null,
      status: 'pending',
    };

    await this.saveQueue([...queue, entry]);
  }

  static async processQueue(
    submitFn: (payload: CreateIncidentInput) => Promise<{ id: string }>,
  ): Promise<void> {
    const queue = await this.getQueue();
    const remaining: QueuedIncident[] = [];

    for (const item of queue) {
      if (item.attempts >= MAX_OFFLINE_RETRY_ATTEMPTS) {
        item.status = 'failed';
        remaining.push(item);
        continue;
      }

      const delay = Math.min(
        OFFLINE_RETRY_BASE_DELAY_MS * Math.pow(2, item.attempts),
        OFFLINE_RETRY_MAX_DELAY_MS,
      );

      if (item.lastAttemptAt && Date.now() - item.lastAttemptAt < delay) {
        remaining.push(item);
        continue;
      }

      try {
        await submitFn(item.payload);
        // Successfully submitted — remove from queue
      } catch {
        item.attempts += 1;
        item.lastAttemptAt = Date.now();
        item.status = 'retrying';
        remaining.push(item);
      }
    }

    await this.saveQueue(remaining);
  }

  static async getPending(): Promise<QueuedIncident[]> {
    const queue = await this.getQueue();
    return queue.filter((q) => q.status !== 'failed');
  }

  static async clear(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
  }
}
