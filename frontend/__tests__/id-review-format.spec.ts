import { ID_CARD_RELEASE_REASONS, ID_REJECTION_REASONS, ID_REVIEW_STATUSES, IdVerificationErrorCode } from '@agap/shared';
import {
  CARD_RELEASE_REASON_LABELS,
  cardHolderNotes,
  REJECTION_REASON_LABELS,
  REVIEW_STATUS_LABELS,
  reviewCheckHint,
  reviewReasonLabel,
} from '@/features/identity-verification/format';

describe('PhilHealth ID review labels', () => {
  it('names the name parts that failed, in order', () => {
    expect(reviewReasonLabel({ kind: 'NAME_MISMATCH', failedParts: ['last', 'middle'] })).toBe(
      "Name doesn't match: last name, middle name",
    );
    expect(reviewReasonLabel({ kind: 'NAME_MISMATCH', failedParts: [] })).toBe("Name doesn't match");
  });

  it('tells an unreadable card from one that is not a PhilHealth ID', () => {
    expect(reviewReasonLabel({ kind: 'SCAN_FAILURE', code: IdVerificationErrorCode.UNREADABLE })).toBe("The ID couldn't be read");
    expect(reviewReasonLabel({ kind: 'SCAN_FAILURE', code: IdVerificationErrorCode.NOT_PHILHEALTH_ID })).toBe(
      'Not recognised as a PhilHealth ID',
    );
    expect(reviewReasonLabel({ kind: 'UNKNOWN' })).toBe('Sent for review');
  });

  it('gives a review hint for every reason kind', () => {
    expect(reviewCheckHint({ kind: 'NAME_MISMATCH', failedParts: ['first'] })).toMatch(/typed name/);
    expect(reviewCheckHint({ kind: 'SCAN_FAILURE', code: IdVerificationErrorCode.UNREADABLE })).toMatch(/PhilHealth ID/);
    expect(reviewCheckHint({ kind: 'UNKNOWN' })).toMatch(/PhilHealth ID/);
  });

  describe('cardHolderNotes', () => {
    const holder = (over: { status?: string; phoneVerified?: boolean; review?: boolean } = {}) => ({
      status: over.review ? ('PENDING_REVIEW' as const) : ('AUTO_VERIFIED' as const),
      account: { id: 'u', name: 'Juan', phoneNumber: null, status: over.status ?? 'ACTIVE', phoneVerified: over.phoneVerified ?? true },
    });

    it('says nothing about an ordinary verified account', () => {
      expect(cardHolderNotes(holder())).toEqual([]);
    });

    it('warns that releasing from a banned account lets the card be used again', () => {
      expect(cardHolderNotes(holder({ status: 'SUSPENDED' })).join(' ')).toMatch(/suspended.*new account/i);
      expect(cardHolderNotes(holder({ status: 'DEACTIVATED' })).join(' ')).toMatch(/deactivated.*new account/i);
    });

    it('points out an unconfirmed phone and a check still under review', () => {
      expect(cardHolderNotes(holder({ phoneVerified: false })).join(' ')).toMatch(/never confirmed/);
      expect(cardHolderNotes(holder({ review: true })).join(' ')).toMatch(/waiting for review/);
    });
  });

  it('has a label for every release reason', () => {
    for (const code of ID_CARD_RELEASE_REASONS) expect(CARD_RELEASE_REASON_LABELS[code]).toBeTruthy();
  });

  it('has a label for every rejection reason and status the API uses', () => {
    for (const code of ID_REJECTION_REASONS) expect(REJECTION_REASON_LABELS[code]).toBeTruthy();
    for (const status of ID_REVIEW_STATUSES) expect(REVIEW_STATUS_LABELS[status]).toBeTruthy();
  });
});
