import { BadRequestException } from '@nestjs/common';
import { defaultAnalyticsDateRange, type AnalyticsDateRange } from './analytics.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `from` / `to` query strings → a range (default: the last 30 days). 400 when either is not
 * a date, when `from` is not before `to`, or when the range is longer than `maxDays`.
 */
export function parseAnalyticsRange(from?: string, to?: string, maxDays?: number): AnalyticsDateRange {
  const defaults = defaultAnalyticsDateRange();
  const parsedFrom = from ? new Date(from) : defaults.from;
  const parsedTo = to ? new Date(to) : defaults.to;
  if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime())) {
    throw new BadRequestException('from and to must be valid ISO dates.');
  }
  if (parsedFrom >= parsedTo) {
    throw new BadRequestException('from must be earlier than to.');
  }
  if (maxDays !== undefined && parsedTo.getTime() - parsedFrom.getTime() > maxDays * DAY_MS) {
    throw new BadRequestException(`Choose a period of at most ${maxDays} days.`);
  }
  return { from: parsedFrom, to: parsedTo };
}
