import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type {
  IdCardHolder,
  IdCardReleaseReason,
  IdCardReleaseResult,
  IdDocumentType,
  IdRejectionReason,
  IdReviewDecisionResult,
  IdReviewItem,
  IdReviewStatus,
  PaginatedResult,
} from '@agap/shared';

// ID staff review, PhilHealth ID and National ID (MOD-01 / MOD-48, plan §7): /administration/id-verifications.

export interface IdReviewParams {
  status?: IdReviewStatus;
  page?: number;
  perPage?: number;
}

export function fetchIdReviews(params?: IdReviewParams): Promise<PaginatedResult<IdReviewItem>> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.perPage) qs.set('perPage', String(params.perPage));
  return api.get(`/administration/id-verifications?${qs}`, getToken());
}

/** The stored ID image. Every call is audited server-side, so call it only on a reviewer's click. */
export function fetchIdImage(id: string): Promise<Blob> {
  return api.blob(`/administration/id-verifications/${id}/image`, getToken());
}

/** `cardNumber`: typed by staff from the image when no number was read (plan §7). In the body, never the URL. */
export function approveIdReview(id: string, cardNumber?: string): Promise<IdReviewDecisionResult> {
  return api.post(`/administration/id-verifications/${id}/approve`, cardNumber ? { cardNumber } : {}, getToken());
}

export function rejectIdReview(id: string, reason: IdRejectionReason): Promise<IdReviewDecisionResult> {
  return api.post(`/administration/id-verifications/${id}/reject`, { reason }, getToken());
}

/** Which account holds this card? Audited server-side. The number goes in the body, never the URL. */
export function findIdCardHolder(pin: string, documentType: IdDocumentType): Promise<IdCardHolder> {
  return api.post('/administration/id-verifications/find-by-pin', { pin, documentType }, getToken());
}

export function releaseIdCard(id: string, reason: IdCardReleaseReason): Promise<IdCardReleaseResult> {
  return api.post(`/administration/id-verifications/${id}/release`, { reason }, getToken());
}
