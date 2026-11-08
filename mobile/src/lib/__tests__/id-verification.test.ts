/// <reference types="jest" />
import { ID_DOCUMENT_TYPES, ID_SCAN_MAX_ATTEMPTS, IdVerificationErrorCode } from '@agap/shared';
import {
  IdVerificationError,
  canCreateAccount,
  canOfferReview,
  checkTypedName,
  countsAsAttempt,
  formatNameOnId,
  frameToPhotoCrop,
  idConsentCard,
  idStatusView,
  localReadVerdict,
  nextAttemptNumber,
  readIdVerificationCode,
  retryMessageKey,
  scanFailureFromError,
  toIdVerificationError,
  typedIdName,
  type IdScanFailureReason,
} from '../id-verification';
import { ApiError, NetworkError } from '../../services/api/http';
import { en, fil } from '../../i18n/translations';

// MOD-01 ID verification (plan §3–§4). Invented names and fake numbers only.
const ON_ID = { last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' };
const PHILHEALTH_TEXT = 'PhilHealth\nPhilippine Health Insurance Corporation\n00-000000001-0\nDELA CRUZ, JUAN SANTOS';
const LICENCE_TEXT = "LAND TRANSPORTATION OFFICE\nNON-PROFESSIONAL DRIVER'S LICENSE\nDELA CRUZ, JUAN SANTOS";
const NATIONAL_TEXT = 'REPUBLIKA NG PILIPINAS\nPAMBANSANG PAGKAKAKILANLAN\n0000-0000-0000-0001\nApelyido/Last Name\nDELA CRUZ';

const apiError = (status: number, code?: string) =>
  new ApiError('refused', status, code ? { statusCode: status, code, message: 'refused' } : { message: 'refused' });

const ALL_REASONS: IdScanFailureReason[] = [
  'NOT_RECOGNISED',
  'NOT_PHILHEALTH_ID',
  'NOT_NATIONAL_ID',
  'UNREADABLE',
  'IMAGE_PROBLEM',
  'ID_ALREADY_REGISTERED',
  'OUTSIDE_SERVICE_AREA',
  'CONSENT_REQUIRED',
  'OFFLINE',
  'SERVER_ERROR',
];

describe('server error codes', () => {
  it('reads only the codes the app knows', () => {
    expect(readIdVerificationCode({ code: 'ID_SCAN_EXPIRED' })).toBe(IdVerificationErrorCode.ID_SCAN_EXPIRED);
    expect(readIdVerificationCode({ code: 'SOMETHING_NEW' })).toBeNull();
    expect(readIdVerificationCode({ message: 'x' })).toBeNull();
    expect(readIdVerificationCode(null)).toBeNull();
  });

  it('turns a coded ApiError into a typed IdVerificationError and leaves others alone', () => {
    const typed = toIdVerificationError(apiError(400, 'NAME_DOES_NOT_MATCH_ID'));
    expect(typed).toBeInstanceOf(IdVerificationError);
    expect(typed).toBeInstanceOf(ApiError); // existing `instanceof ApiError` handling still applies
    expect((typed as IdVerificationError).code).toBe(IdVerificationErrorCode.NAME_DOES_NOT_MATCH_ID);
    expect((typed as IdVerificationError).status).toBe(400);

    const plain = apiError(400);
    expect(toIdVerificationError(plain)).toBe(plain);
    const network = new NetworkError();
    expect(toIdVerificationError(network)).toBe(network);
  });

  it.each([
    ['NOT_PHILHEALTH_ID', 422, 'NOT_PHILHEALTH_ID'],
    ['NOT_NATIONAL_ID', 422, 'NOT_NATIONAL_ID'],
    ['UNREADABLE', 422, 'UNREADABLE'],
    ['IMAGE_TOO_LARGE', 413, 'IMAGE_PROBLEM'],
    ['UNSUPPORTED_IMAGE_TYPE', 415, 'IMAGE_PROBLEM'],
    ['ID_ALREADY_REGISTERED', 409, 'ID_ALREADY_REGISTERED'],
    ['OUTSIDE_SERVICE_AREA', 400, 'OUTSIDE_SERVICE_AREA'],
    ['CONSENT_REQUIRED', 400, 'CONSENT_REQUIRED'],
  ])('maps the scan error %s to %s', (code, status, reason) => {
    expect(scanFailureFromError(apiError(status, code))).toBe(reason);
    expect(scanFailureFromError(toIdVerificationError(apiError(status, code)))).toBe(reason);
  });

  it('treats a lost connection as offline and anything else as a server problem', () => {
    expect(scanFailureFromError(new NetworkError())).toBe('OFFLINE');
    expect(scanFailureFromError(apiError(503))).toBe('SERVER_ERROR');
    expect(scanFailureFromError(apiError(429))).toBe('SERVER_ERROR');
    expect(scanFailureFromError(new Error('boom'))).toBe('SERVER_ERROR');
  });

  it('has an explanation for every failure in English and Filipino', () => {
    for (const reason of ALL_REASONS) {
      for (const documentType of ID_DOCUMENT_TYPES) {
        const key = retryMessageKey(reason, documentType);
        expect(typeof en.registration[key]).toBe('string');
        expect(String(en.registration[key]).trim()).not.toBe('');
        expect(String(fil.registration[key]).trim()).not.toBe('');
      }
    }
  });

  it('names the chosen ID in each failure about the card, in English and Filipino', () => {
    const naming: Array<[IdScanFailureReason, typeof ID_DOCUMENT_TYPES[number], string, string]> = [
      ['NOT_RECOGNISED', 'PHILHEALTH', 'PhilHealth', 'National ID'],
      ['NOT_RECOGNISED', 'NATIONAL_ID', 'National ID', 'PhilHealth'],
      ['UNREADABLE', 'PHILHEALTH', 'PhilHealth', 'National ID'],
      ['UNREADABLE', 'NATIONAL_ID', 'National ID', 'PhilHealth'],
      ['ID_ALREADY_REGISTERED', 'PHILHEALTH', 'PhilHealth', 'National ID'],
      ['ID_ALREADY_REGISTERED', 'NATIONAL_ID', 'National ID', 'PhilHealth'],
      ['NOT_PHILHEALTH_ID', 'PHILHEALTH', 'PhilHealth', 'National ID'],
      ['NOT_NATIONAL_ID', 'NATIONAL_ID', 'National ID', 'PhilHealth'],
    ];
    for (const [reason, documentType, named, notNamed] of naming) {
      for (const language of [en, fil]) {
        const message = String(language.registration[retryMessageKey(reason, documentType)]);
        expect(message).toContain(named);
        expect(message).not.toContain(notNamed);
      }
    }
  });

  it('a wrong-card message points to choosing a different ID', () => {
    for (const reason of ['NOT_PHILHEALTH_ID', 'NOT_NATIONAL_ID'] as const) {
      expect(String(en.registration[retryMessageKey(reason, 'PHILHEALTH')])).toContain('choose a different ID');
      expect(String(fil.registration[retryMessageKey(reason, 'PHILHEALTH')])).toContain('pumili ng ibang ID');
    }
  });

  it('a failure that has nothing to do with the card reads the same for either ID', () => {
    for (const reason of ['IMAGE_PROBLEM', 'OUTSIDE_SERVICE_AREA', 'CONSENT_REQUIRED', 'OFFLINE', 'SERVER_ERROR'] as const) {
      expect(retryMessageKey(reason, 'NATIONAL_ID')).toBe(retryMessageKey(reason, 'PHILHEALTH'));
    }
  });
});

describe('text for each ID', () => {
  /** Keys that deliberately name one ID, whichever was chosen. */
  const PER_ID_KEYS = new Set([
    'idErrorNotRecognised',
    'idErrorNotRecognisedNational',
    'idErrorNotPhilHealth',
    'idErrorNotNationalId',
    'idErrorUnreadable',
    'idErrorUnreadableNational',
    'idErrorAlreadyRegistered',
    'idErrorAlreadyRegisteredNational',
    'idAcceptedIds',
  ]);

  it.each([
    ['English', en],
    ['Filipino', fil],
  ])('%s: each ID has all its sentences, and none names the other ID', (_language, language) => {
    const sample = (type: typeof ID_DOCUMENT_TYPES[number]) => {
      const { scannedBadge, ...text } = language.registration.idDocument[type];
      return [...Object.values(text), scannedBadge('0001')];
    };
    for (const line of sample('PHILHEALTH')) {
      expect(line.trim()).not.toBe('');
      expect(line).not.toContain('National ID');
      expect(line).not.toContain('PhilSys');
    }
    for (const line of sample('NATIONAL_ID')) {
      expect(line.trim()).not.toBe('');
      expect(line).not.toContain('PhilHealth');
      expect(line).not.toContain('PIN');
    }
  });

  it.each([
    ['English', en],
    ['Filipino', fil],
  ])('%s: the text anyone may see, on either ID, names neither card', (_language, language) => {
    const flat = [
      ...Object.entries(language.registration).filter(([key]) => /^(id|name|createDisabled)/.test(key) && !PER_ID_KEYS.has(key)),
      ...Object.entries(language.profile).filter(([key]) => key.startsWith('id')),
    ];
    expect(flat.length).toBeGreaterThan(30);
    for (const [, value] of flat) {
      if (typeof value !== 'string') continue;
      expect(value).not.toContain('PhilHealth');
      expect(value).not.toContain('National ID');
    }
  });

  it.each([
    ['English', en],
    ['Filipino', fil],
  ])('%s: the National ID consent says the PhilSys Number and QR code are not read', (_language, language) => {
    const { whatWeRead } = language.registration.idDocument.NATIONAL_ID;
    expect(whatWeRead).toContain('16-digit');
    expect(whatWeRead).toContain('PhilSys Number');
    expect(whatWeRead).toContain('QR code');
  });

  it('the scanned badge shows only the last 4 digits it is given, under the right name for the number', () => {
    expect(en.registration.idDocument.PHILHEALTH.scannedBadge('0010')).toBe('PhilHealth ID scanned · PIN ending in 0010');
    expect(en.registration.idDocument.NATIONAL_ID.scannedBadge('0001')).toBe('National ID scanned · card number ending in 0001');
  });

  it('someone with neither card is told what they can still do, signed in or not', () => {
    for (const language of [en, fil]) {
      expect(language.registration.idChooseNeither).toContain('emergency');
      expect(language.registration.idChooseNeitherSignedIn).toContain('SOS');
    }
  });
});

describe('the Privacy & Consent card', () => {
  it('shows nothing without an ID consent', () => {
    expect(idConsentCard([])).toBeNull();
  });

  it('names the PhilHealth ID, with the wording it always had', () => {
    const card = idConsentCard(['PHILHEALTH'])!;
    expect(card).toEqual({
      consentType: 'ID_VERIFICATION_PHILHEALTH',
      title: 'PhilHealth ID Check',
      whatWeKeep:
        "We keep your PhilHealth number only in a form that can't be read back, its last 4 digits, and the name read from your ID, encrypted. Your ID image is deleted once the check is done.",
      confirmTitle: 'Withdraw PhilHealth ID consent?',
      confirmBody:
        'We will erase your PhilHealth number, the name read from your ID, and any stored image. Your account will show as not ID verified until you scan your ID again. You can still sign in and send an SOS.',
    });
  });

  it('names the National ID, withdraws that consent, and says the PhilSys Number is never read', () => {
    const card = idConsentCard(['NATIONAL_ID'])!;
    expect(card.consentType).toBe('ID_VERIFICATION_NATIONAL_ID');
    expect(card.title).toBe('National ID Check');
    expect(card.confirmTitle).toBe('Withdraw National ID consent?');
    expect(card.confirmBody).toContain('National ID card number');
    expect(card.whatWeKeep).toContain('We never read your PhilSys Number.');
    expect(JSON.stringify(card)).not.toContain('PhilHealth');
  });

  it('someone holding both gets one card naming both, since withdrawing erases both', () => {
    const card = idConsentCard(['PHILHEALTH', 'NATIONAL_ID'])!;
    expect(card.title).toBe('PhilHealth ID and National ID Check');
    expect(card.confirmBody).toContain('PhilHealth number and National ID card number');
    expect(card.whatWeKeep).toContain('their last 4 digits');
    expect(card.whatWeKeep).toContain('We never read your PhilSys Number.');
    expect(card.consentType).toBe('ID_VERIFICATION_PHILHEALTH');
  });
});

describe('attempts and the review offer', () => {
  it('counts only scans of the card itself, not connection or server trouble', () => {
    expect(ALL_REASONS.filter(countsAsAttempt).sort()).toEqual(
      ['IMAGE_PROBLEM', 'NOT_NATIONAL_ID', 'NOT_PHILHEALTH_ID', 'NOT_RECOGNISED', 'UNREADABLE'].sort(),
    );
  });

  it('offers "Send to MDRRMO for review" from the third failed attempt on', () => {
    expect(ID_SCAN_MAX_ATTEMPTS).toBe(3);
    expect(canOfferReview(0)).toBe(false);
    expect(canOfferReview(2)).toBe(false);
    expect(canOfferReview(3)).toBe(true);
    expect(canOfferReview(4)).toBe(true);
  });

  it('a citizen whose card fails three times, with a dropped connection in between, gets the offer', () => {
    let failed = 0;
    const sent: number[] = [];
    for (const reason of ['UNREADABLE', 'OFFLINE', 'NOT_RECOGNISED', 'SERVER_ERROR', 'NOT_PHILHEALTH_ID'] as const) {
      sent.push(nextAttemptNumber(failed));
      if (countsAsAttempt(reason)) failed++;
    }
    expect(sent).toEqual([1, 2, 2, 3, 3]);
    expect(failed).toBe(3);
    expect(canOfferReview(failed)).toBe(true);
    // The review upload is attempt 4: the server honours review from attempt 3 on.
    expect(nextAttemptNumber(failed)).toBeGreaterThanOrEqual(ID_SCAN_MAX_ATTEMPTS);
  });
});

describe("the phone's own check", () => {
  it('uploads when the phone reads a PhilHealth heading and PIN, or cannot read text at all', () => {
    expect(localReadVerdict(PHILHEALTH_TEXT, 'PHILHEALTH')).toBe('ok');
    expect(localReadVerdict(null, 'PHILHEALTH')).toBe('unknown');
  });

  it("stops another card or an unreadable scan before upload", () => {
    expect(localReadVerdict(LICENCE_TEXT, 'PHILHEALTH')).toBe('not_recognised');
    expect(localReadVerdict('', 'PHILHEALTH')).toBe('not_recognised');
    expect(localReadVerdict('PhilHealth', 'PHILHEALTH')).toBe('not_recognised'); // heading without a PIN
  });

  it('uploads when the phone reads a National ID with that ID chosen, or cannot read text at all', () => {
    expect(localReadVerdict(NATIONAL_TEXT, 'NATIONAL_ID')).toBe('ok');
    expect(localReadVerdict(null, 'NATIONAL_ID')).toBe('unknown');
  });

  it('stops the wrong card, both ways round', () => {
    expect(localReadVerdict(NATIONAL_TEXT, 'PHILHEALTH')).toBe('not_recognised');
    expect(localReadVerdict(PHILHEALTH_TEXT, 'NATIONAL_ID')).toBe('not_recognised');
    expect(localReadVerdict(LICENCE_TEXT, 'NATIONAL_ID')).toBe('not_recognised');
  });

  it('a National ID heading with only a 12-digit run is not recognised: that may be the PhilSys Number', () => {
    expect(localReadVerdict('PAMBANSANG PAGKAKAKILANLAN\n0000 0000 0012', 'NATIONAL_ID')).toBe('not_recognised');
    expect(localReadVerdict('PAMBANSANG PAGKAKAKILANLAN\n000000000012', 'NATIONAL_ID')).toBe('not_recognised');
    expect(localReadVerdict('PAMBANSANG PAGKAKAKILANLAN', 'NATIONAL_ID')).toBe('not_recognised');
  });
});

describe('"Create account" rule', () => {
  const typed = (last: string, first: string, middle = '', suffix = '') => typedIdName({ last, first, middle, suffix });

  it('needs last and first name before any check', () => {
    expect(typed('', 'Juan')).toBeNull();
    expect(typed('Dela Cruz', '  ')).toBeNull();
    expect(typed(' Dela Cruz ', ' Juan ', ' ', '')).toEqual({ last: 'Dela Cruz', first: 'Juan' });
    expect(typed('Dela Cruz', 'Juan', 'S.', 'Jr.')).toEqual({ last: 'Dela Cruz', first: 'Juan', middle: 'S.', suffix: 'Jr.' });
    expect(checkTypedName(null, ON_ID)).toBeNull();
    expect(checkTypedName(typed('Dela Cruz', 'Juan'), null)).toBeNull(); // review scan: nothing to match
  });

  it('is enabled when the typed name matches the card (shared matcher)', () => {
    const match = checkTypedName(typed('dela cruz', 'Juan', 'S.'), ON_ID);
    expect(match?.matches).toBe(true);
    expect(canCreateAccount({ nameMatches: match!.matches, reviewChosen: false, reviewScan: false })).toBe(true);
  });

  it('is disabled on a mismatch until the citizen sends the ID for review', () => {
    const match = checkTypedName(typed('Reyes', 'Juan'), ON_ID);
    expect(match).toMatchObject({ matches: false, parts: { last: false, first: true } });
    expect(canCreateAccount({ nameMatches: false, reviewChosen: false, reviewScan: false })).toBe(false);
    expect(canCreateAccount({ nameMatches: false, reviewChosen: true, reviewScan: false })).toBe(true);
  });

  it('is enabled for a scan that already went to staff review', () => {
    expect(canCreateAccount({ nameMatches: false, reviewChosen: false, reviewScan: true })).toBe(true);
  });

  it("shows the card's name the way the card prints it", () => {
    expect(formatNameOnId(ON_ID)).toBe('DELA CRUZ, JUAN SANTOS');
    expect(formatNameOnId({ last: 'Reyes', first: 'Ana', suffix: 'Jr.' })).toBe('REYES, ANA JR.');
  });
});

describe('fallback camera crop', () => {
  // Portrait phone: a 400×800 view over a 3000×4000 photo shown like `cover`.
  const view = { width: 400, height: 800 };
  const photo = { width: 3000, height: 4000 };
  const frame = { x: 28, y: 291.6, width: 344, height: 216.8 };

  it('maps the on-screen card frame onto the same area of the photo, with a small margin', () => {
    const crop = frameToPhotoCrop(view, frame, photo);
    // Scale 0.2 (height-bound), 100 px of the photo's width hidden on each side of the preview.
    expect(crop.originX + crop.width / 2).toBeCloseTo(1500, -1);
    expect(crop.originY + crop.height / 2).toBeCloseTo(2000, -1);
    expect(crop.width).toBeCloseTo((344 * 1.12) / 0.2, -1);
    expect(crop.height).toBeCloseTo((216.8 * 1.12) / 0.2, -1);
  });

  it('never reaches outside the photo', () => {
    const crop = frameToPhotoCrop(view, { x: -50, y: -50, width: 600, height: 900 }, photo);
    expect(crop.originX).toBeGreaterThanOrEqual(0);
    expect(crop.originY).toBeGreaterThanOrEqual(0);
    expect(crop.originX + crop.width).toBeLessThanOrEqual(photo.width);
    expect(crop.originY + crop.height).toBeLessThanOrEqual(photo.height);
  });
});

describe('idStatusView', () => {
  it('offers "Scan again" only when there is nothing current to wait for', () => {
    expect(idStatusView('VERIFIED')).toMatchObject({ labelKey: 'idStatusVerified', canScanAgain: false });
    expect(idStatusView('UNDER_REVIEW')).toMatchObject({ labelKey: 'idStatusUnderReview', canScanAgain: false });
    expect(idStatusView('NOT_APPROVED')).toMatchObject({ labelKey: 'idStatusNotApproved', canScanAgain: true });
    expect(idStatusView('NOT_VERIFIED')).toMatchObject({ labelKey: 'idStatusNotVerified', canScanAgain: true });
  });
});
