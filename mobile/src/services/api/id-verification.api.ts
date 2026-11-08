import type { IdClaimResponse, IdProfileStatus } from '@agap/shared';
import { toIdVerificationError } from '../../lib/id-verification';
import { authedFetch } from './authed-fetch';
import { readJson } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** The signed-in citizen's ID status, for their profile (plan §8). */
export async function getIdVerificationStatus(): Promise<{ status: IdProfileStatus }> {
  return readJson(await authedFetch(`${API_BASE}/v1/auth/id-verification/status`));
}

/** Claims a new scan (from submitIdScan) for the signed-in citizen. Rejects with an IdVerificationError for ID refusals. */
export async function claimIdScan(body: {
  idVerificationToken: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  suffix?: string;
  requestReview?: boolean;
}): Promise<IdClaimResponse> {
  try {
    return await readJson<IdClaimResponse>(
      await authedFetch(`${API_BASE}/v1/auth/id-verification/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  } catch (err) {
    throw toIdVerificationError(err);
  }
}
