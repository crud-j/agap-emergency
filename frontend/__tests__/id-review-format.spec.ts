import { ID_CARD_RELEASE_REASONS, ID_DOCUMENT_TYPES, ID_REJECTION_REASONS, ID_REVIEW_STATUSES, IdVerificationErrorCode, type IdReviewReason } from '@agap/shared';
import {
  approveErrorText,
  CARD_NUMBER_FIELD,
  CARD_RELEASE_REASON_LABELS,
  cardHolderNotes,
  idDocumentLabel,
  needsCardNumberToApprove,
  rejectionReasonsFor,
  reporterIdLabel,
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
    expect(reviewCheckHint({ kind: 'NAME_MISMATCH', failedParts: ['first'] }, 'PHILHEALTH')).toMatch(/typed name/);
    expect(reviewCheckHint({ kind: 'SCAN_FAILURE', code: IdVerificationErrorCode.UNREADABLE }, 'PHILHEALTH')).toMatch(/PhilHealth ID/);
    expect(reviewCheckHint({ kind: 'UNKNOWN' }, 'PHILHEALTH')).toMatch(/PhilHealth ID/);
  });

  it('labels the reporter only when an account exists: a guest gets no label', () => {
    expect(reporterIdLabel(true)).toBe('ID verified');
    expect(reporterIdLabel(false)).toBe('ID not verified');
    expect(reporterIdLabel(null)).toBeNull();
    expect(reporterIdLabel(undefined)).toBeNull();
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

describe('National ID review labels (National ID plan §7)', () => {
  it('names each ID type', () => {
    expect(idDocumentLabel('PHILHEALTH')).toBe('PhilHealth ID');
    expect(idDocumentLabel('NATIONAL_ID')).toBe('National ID');
    for (const type of ID_DOCUMENT_TYPES) expect(idDocumentLabel(type)).toBeTruthy();
  });

  it('labels both wrong-card codes by their own ID, never the other', () => {
    expect(reviewReasonLabel({ kind: 'SCAN_FAILURE', code: IdVerificationErrorCode.NOT_NATIONAL_ID })).toBe(
      'Not recognised as a National ID',
    );
    expect(reviewReasonLabel({ kind: 'SCAN_FAILURE', code: IdVerificationErrorCode.NOT_PHILHEALTH_ID })).not.toMatch(/National/);
    expect(REJECTION_REASON_LABELS.NOT_NATIONAL_ID).toBe('Not a National ID');
  });

  describe('reviewCheckHint', () => {
    const reasons: IdReviewReason[] = [
      { kind: 'NAME_MISMATCH', failedParts: ['last'] },
      { kind: 'SCAN_FAILURE', code: IdVerificationErrorCode.UNREADABLE },
      { kind: 'SCAN_FAILURE', code: IdVerificationErrorCode.NOT_NATIONAL_ID },
      { kind: 'UNKNOWN' },
    ];

    it('names the chosen ID for every reason, and never the other one', () => {
      for (const reason of reasons) {
        expect(reviewCheckHint(reason, 'NATIONAL_ID')).toMatch(/front of a National ID/);
        expect(reviewCheckHint(reason, 'NATIONAL_ID')).not.toMatch(/PhilHealth/);
        expect(reviewCheckHint(reason, 'PHILHEALTH')).toMatch(/front of a PhilHealth ID/);
        expect(reviewCheckHint(reason, 'PHILHEALTH')).not.toMatch(/National|ePhilID/);
      }
    });

    it('says a legible printed ePhilID may be approved for a National ID (N1)', () => {
      for (const reason of reasons) expect(reviewCheckHint(reason, 'NATIONAL_ID')).toMatch(/legible printed ePhilID.*may be approved/);
    });

    it('points a card that failed to read at the matching wrong-card reason', () => {
      const unreadable = { kind: 'SCAN_FAILURE', code: IdVerificationErrorCode.UNREADABLE } as const;
      expect(reviewCheckHint(unreadable, 'NATIONAL_ID')).toContain('"Not a National ID"');
      expect(reviewCheckHint(unreadable, 'PHILHEALTH')).toContain('"Not a PhilHealth ID"');
    });
  });

  describe('rejectionReasonsFor', () => {
    it("offers a type's own wrong-card reason and never the other type's (the server answers 400)", () => {
      expect(rejectionReasonsFor('NATIONAL_ID')).toContain('NOT_NATIONAL_ID');
      expect(rejectionReasonsFor('NATIONAL_ID')).not.toContain('NOT_PHILHEALTH');
      expect(rejectionReasonsFor('PHILHEALTH')).toContain('NOT_PHILHEALTH');
      expect(rejectionReasonsFor('PHILHEALTH')).not.toContain('NOT_NATIONAL_ID');
    });

    it('keeps every reason that fits any ID, in the shared order', () => {
      expect(rejectionReasonsFor('PHILHEALTH')).toEqual(['NOT_PHILHEALTH', 'NAME_MISMATCH', 'UNREADABLE', 'SUSPECTED_FRAUD']);
      expect(rejectionReasonsFor('NATIONAL_ID')).toEqual(['NOT_NATIONAL_ID', 'NAME_MISMATCH', 'UNREADABLE', 'SUSPECTED_FRAUD']);
    });
  });

  describe('needsCardNumberToApprove (plan §7, N8)', () => {
    const item = (over: Partial<{ status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'; documentType: 'PHILHEALTH' | 'NATIONAL_ID'; hasCardNumber: boolean }>) => ({
      status: 'PENDING_REVIEW' as const,
      documentType: 'NATIONAL_ID' as const,
      hasCardNumber: false,
      ...over,
    });

    it('asks for the number on a pending National ID with none stored', () => {
      expect(needsCardNumberToApprove(item({}))).toBe(true);
    });

    it('does not ask when a number is stored, the check is decided, or it is a PhilHealth ID', () => {
      expect(needsCardNumberToApprove(item({ hasCardNumber: true }))).toBe(false);
      expect(needsCardNumberToApprove(item({ status: 'APPROVED' }))).toBe(false);
      expect(needsCardNumberToApprove(item({ status: 'REJECTED' }))).toBe(false);
      expect(needsCardNumberToApprove(item({ documentType: 'PHILHEALTH' }))).toBe(false);
    });
  });

  describe('CARD_NUMBER_FIELD', () => {
    it('asks for the 16-digit number on the front, warns off the PhilSys Number, and uses a fake example', () => {
      const field = CARD_NUMBER_FIELD.NATIONAL_ID;
      expect(field.label).toMatch(/16-digit.*front/);
      expect(field.warning).toMatch(/PhilSys Number/);
      expect(field.placeholder).toContain('0000-0000-0000-0001');
    });

    it('keeps the PhilHealth field as it was, with no PhilSys warning', () => {
      expect(CARD_NUMBER_FIELD.PHILHEALTH.placeholder).toBe('Number on the card, e.g. 00-000000001-0');
      expect(CARD_NUMBER_FIELD.PHILHEALTH.label).toBe('PhilHealth number on the card');
      expect(CARD_NUMBER_FIELD.PHILHEALTH.warning).toBeNull();
    });
  });

  describe('approveErrorText', () => {
    it('asks for the right number on a 400', () => {
      expect(approveErrorText(400, undefined, 'NATIONAL_ID')).toMatch(/16-digit card number.*not the PhilSys Number/);
    });

    it('tells a card already held (409 ID_ALREADY_REGISTERED) from a check already decided (plain 409)', () => {
      expect(approveErrorText(409, IdVerificationErrorCode.ID_ALREADY_REGISTERED, 'NATIONAL_ID')).toMatch(
        /National ID is already linked to another account\. Nothing was changed/,
      );
      expect(approveErrorText(409, undefined, 'NATIONAL_ID')).toBeNull();
      expect(approveErrorText(403, undefined, 'NATIONAL_ID')).toBeNull();
    });

    it('sends staff to the card lookup with the right ID chosen, since it starts on PhilHealth', () => {
      expect(approveErrorText(409, IdVerificationErrorCode.ID_ALREADY_REGISTERED, 'NATIONAL_ID')).toMatch(
        /"Find account".*with National ID chosen/,
      );
    });
  });
});
