import {
  ID_DOCUMENT_RULES,
  ID_DOCUMENT_TYPES,
  ID_REJECTION_REASONS,
  IdVerificationErrorCode,
  type IdCardHolder,
  type IdCardReleaseReason,
  type IdDocumentType,
  type IdNamePart,
  type IdRejectionReason,
  type IdReviewItem,
  type IdReviewReason,
  type IdReviewStatus,
} from '@agap/shared';

// Labels for the ID review page (PhilHealth plan §7, National ID plan §7). No card data is ever
// shown here except the image itself, which loads only on a reviewer's click.

/** The ID's name, e.g. "National ID". From the shared rules, so staff and server say the same. */
export function idDocumentLabel(documentType: IdDocumentType): string {
  return ID_DOCUMENT_RULES[documentType].label;
}

/** What staff see where they type a card's number. Example numbers are fake. */
export const CARD_NUMBER_FIELD: Record<IdDocumentType, { label: string; placeholder: string; warning: string | null }> = {
  PHILHEALTH: {
    label: 'PhilHealth number on the card',
    placeholder: 'Number on the card, e.g. 00-000000001-0',
    warning: null,
  },
  NATIONAL_ID: {
    label: '16-digit card number on the front of the National ID',
    placeholder: 'Card number on the front, e.g. 0000-0000-0000-0001',
    warning: 'Never type or ask for the PhilSys Number (12 digits, on the back). AGAP must not use it.',
  },
};

export const REVIEW_STATUS_LABELS: Record<IdReviewStatus, string> = {
  PENDING_REVIEW: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const REJECTION_REASON_LABELS: Record<IdRejectionReason, string> = {
  NOT_PHILHEALTH: 'Not a PhilHealth ID',
  NOT_NATIONAL_ID: 'Not a National ID',
  NAME_MISMATCH: "Name doesn't match the ID",
  UNREADABLE: "ID can't be read",
  SUSPECTED_FRAUD: 'Suspected fraud',
};

export const CARD_RELEASE_REASON_LABELS: Record<IdCardReleaseReason, string> = {
  OWNER_DISPUTE: 'The card\'s owner showed it; this account isn\'t theirs',
  ACCOUNT_CLOSED: 'The account holding it is closed',
  STAFF_CORRECTION: 'Staff correction',
};

/** The reporter card's label. null without a citizen account: a guest just shows as a guest. Information only (plan §8). */
export function reporterIdLabel(verified: boolean | null | undefined): string | null {
  if (verified === true) return 'ID verified';
  if (verified === false) return 'ID not verified';
  return null;
}

/** What the reviewer should know about the account holding a card before releasing it. */
export function cardHolderNotes(holder: Pick<IdCardHolder, 'status' | 'account'>): string[] {
  const notes: string[] = [];
  if (!holder.account.phoneVerified) notes.push('This account never confirmed its phone number.');
  if (holder.account.status === 'DEACTIVATED' || holder.account.status === 'SUSPENDED') {
    notes.push(`This account is ${holder.account.status.toLowerCase()}. Releasing lets the card be used on a new account.`);
  }
  if (holder.status === 'PENDING_REVIEW') notes.push('This check is still waiting for review; releasing also removes it from the queue.');
  return notes;
}

const PART_LABELS: Record<IdNamePart, string> = {
  last: 'last name',
  first: 'first name',
  middle: 'middle name',
  suffix: 'suffix',
};

/** Why this ID went to staff, in a short line for the queue and the detail view. */
export function reviewReasonLabel(reason: IdReviewReason): string {
  switch (reason.kind) {
    case 'NAME_MISMATCH':
      return reason.failedParts.length
        ? `Name doesn't match: ${reason.failedParts.map((part) => PART_LABELS[part]).join(', ')}`
        : "Name doesn't match";
    case 'SCAN_FAILURE': {
      const wrongCardOf = ID_DOCUMENT_TYPES.find((type) => ID_DOCUMENT_RULES[type].wrongCardCode === reason.code);
      return wrongCardOf ? `Not recognised as a ${idDocumentLabel(wrongCardOf)}` : "The ID couldn't be read";
    }
    default:
      return 'Sent for review';
  }
}

/** What image the reviewer should expect for each ID (plan §7, N1: a legible printed ePhilID may be approved). */
const EXPECTED_IMAGE: Record<IdDocumentType, string> = {
  PHILHEALTH: 'the front of a PhilHealth ID',
  NATIONAL_ID: 'the front of a National ID, or a legible printed ePhilID (both may be approved)',
};

/** What the reviewer compares in the image, given why it came to them and which ID the citizen chose. */
export function reviewCheckHint(reason: IdReviewReason, documentType: IdDocumentType): string {
  const otherCard = `If it's a different card, reject it as "${REJECTION_REASON_LABELS[ID_DOCUMENT_RULES[documentType].rejectionReason]}".`;
  switch (reason.kind) {
    case 'NAME_MISMATCH':
      return `Check that the image is ${EXPECTED_IMAGE[documentType]} and that its name is the same person as the typed name (spelling, order, middle name).`;
    case 'SCAN_FAILURE':
      return `Check that the image is ${EXPECTED_IMAGE[documentType]} and that the name on it matches the typed name. ${otherCard}`;
    default:
      return `Check that the image is ${EXPECTED_IMAGE[documentType]} and that the name matches the typed name. ${otherCard}`;
  }
}

/** The rejection reasons that fit this ID: every reason but the other IDs' "wrong card" ones (the server refuses those, 400). */
export function rejectionReasonsFor(documentType: IdDocumentType): IdRejectionReason[] {
  const ownWrongCard = ID_DOCUMENT_RULES[documentType].rejectionReason;
  const wrongCard = new Set<IdRejectionReason>(ID_DOCUMENT_TYPES.map((type) => ID_DOCUMENT_RULES[type].rejectionReason));
  return ID_REJECTION_REASONS.filter((code) => code === ownWrongCard || !wrongCard.has(code));
}

/**
 * Staff must type the card number to approve: the ID's rules need one and none was read, so approving
 * without it would hold no card (plan §7, N8). PhilHealth rows never need it.
 */
export function needsCardNumberToApprove(item: Pick<IdReviewItem, 'status' | 'documentType' | 'hasCardNumber'>): boolean {
  return item.status === 'PENDING_REVIEW' && ID_DOCUMENT_RULES[item.documentType].approvalNeedsNumber && !item.hasCardNumber;
}

/** Why an approval failed, for the errors only approving can cause. null: use the general message. */
export function approveErrorText(status: number, code: unknown, documentType: IdDocumentType): string | null {
  const rules = ID_DOCUMENT_RULES[documentType];
  if (status === 400) return `Enter ${rules.numberPrompt} to approve this check.`;
  if (status === 409 && code === IdVerificationErrorCode.ID_ALREADY_REGISTERED) {
    return `This ${rules.label} is already linked to another account. Nothing was changed. Close this panel and use "Find account" on this page, with ${rules.label} chosen, to see who holds it.`;
  }
  return null;
}
