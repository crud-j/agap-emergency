import type { IdCardHolder, IdCardReleaseReason, IdNamePart, IdRejectionReason, IdReviewReason, IdReviewStatus } from '@agap/shared';

// Labels for the PhilHealth ID review page (plan §7). No card data is ever shown here except
// the image itself, which loads only on a reviewer's click.

export const REVIEW_STATUS_LABELS: Record<IdReviewStatus, string> = {
  PENDING_REVIEW: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const REJECTION_REASON_LABELS: Record<IdRejectionReason, string> = {
  NOT_PHILHEALTH: 'Not a PhilHealth ID',
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
    case 'SCAN_FAILURE':
      return reason.code === 'NOT_PHILHEALTH_ID'
        ? 'Not recognised as a PhilHealth ID'
        : "The ID couldn't be read";
    default:
      return 'Sent for review';
  }
}

/** What the reviewer compares in the image, given why it came to them. */
export function reviewCheckHint(reason: IdReviewReason): string {
  switch (reason.kind) {
    case 'NAME_MISMATCH':
      return 'Check that the name on the ID is the same person as the typed name (spelling, order, middle name).';
    case 'SCAN_FAILURE':
      return 'Check that the image is the front of a PhilHealth ID and that the name on it matches the typed name.';
    default:
      return 'Check that the image is the front of a PhilHealth ID and that the name matches the typed name.';
  }
}
