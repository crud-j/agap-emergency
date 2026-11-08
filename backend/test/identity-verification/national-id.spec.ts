import {
  ID_DOCUMENT_RULES,
  ID_DOCUMENT_TYPES,
  ID_REJECTION_REASONS,
  ID_VERIFICATION_CONSENT_TYPE,
  ID_VERIFICATION_CONSENT_TYPES,
  IdVerificationErrorCode,
  combineIdReads,
  digitRunShapes,
  isIdVerificationConsentType,
  phoneReadSupport,
  looksLikeNationalId,
  looksLikePhilHealthId,
  matchIdName,
  nationalIdReadSignals,
  parseNationalIdName,
  parsePhilHealthName,
  parsePhilHealthPin,
  parsePhilSysCardNumber,
} from '@agap/shared';

// MOD-01 / plan §6 — National ID reading. Invented names and fake numbers only. The layout is from plan
// §6 and one Digital National ID read, NOT a real plastic card: the Phase 0 layout notes are still blank.
const PCN = '0000-0000-0000-0001';
const PCN_DIGITS = '0000000000000001';

const LABELS = {
  last: 'Apelyido/Last Name',
  given: 'Mga Pangalan/Given Names',
  middle: 'Gitnang Apelyido/Middle Name',
  birth: 'Petsa ng Kapanganakan/Date of Birth',
  address: 'Tirahan/Address',
};

/** Made-up OCR text in the expected layout, with the kind of junk tesseract adds. */
const CARD_TEXT = [
  'REPUBLIKA NG PILIPINAS',
  'Republic of the Philippines',
  'PAMBANSANG PAGKAKAKILANLAN',
  'Philippine Identification Card',
  `am | ${PCN}`,
  LABELS.last,
  'DELA CRUZ',
  LABELS.given,
  'JUAN MIGUEL',
  LABELS.middle,
  'SANTOS',
  LABELS.birth,
  'JANUARY 01, 1990',
  LABELS.address,
  'BLK 1 LOT 2 SAMPLE STREET, POBLACION,',
  'BOCAUE, BULACAN',
].join('\n');

const NAME = { last: 'DELA CRUZ', first: 'JUAN MIGUEL', middle: 'SANTOS' };

/** The labelled name block, ready to edit per test. */
function card(last: string, given: string, middle: string, after = `${LABELS.birth}\nJANUARY 01, 1990\n${LABELS.address}\nSAMPLE STREET`): string {
  return [PCN, LABELS.last, last, LABELS.given, given, LABELS.middle, middle, after].join('\n');
}

describe('parsePhilSysCardNumber', () => {
  it('reads 16 digits with dashes, spaces or no separator', () => {
    expect(parsePhilSysCardNumber('0000-0000-0000-0001')).toBe(PCN_DIGITS);
    expect(parsePhilSysCardNumber('0000 0000 0000 0001')).toBe(PCN_DIGITS);
    expect(parsePhilSysCardNumber('0000000000000001')).toBe(PCN_DIGITS);
    expect(parsePhilSysCardNumber('0000 – 0000 – 0000 – 0001')).toBe(PCN_DIGITS);
    expect(parsePhilSysCardNumber('am | 0000-0000-0000-0001 x')).toBe(PCN_DIGITS);
  });

  it('refuses 15 and 17 digits, in every grouping', () => {
    expect(parsePhilSysCardNumber('000000000000001')).toBeNull();
    expect(parsePhilSysCardNumber('0000-0000-0000-001')).toBeNull();
    expect(parsePhilSysCardNumber('00000000000000012')).toBeNull();
    expect(parsePhilSysCardNumber('0000-0000-0000-00012')).toBeNull();
    expect(parsePhilSysCardNumber('0000 0000 0000 0001 2')).toBeNull();
    expect(parsePhilSysCardNumber('1 0000 0000 0000 0001')).toBeNull();
  });

  it('never cuts a longer run down to 16 digits', () => {
    expect(parsePhilSysCardNumber('00000000000000000001')).toBeNull();
    expect(parsePhilSysCardNumber('0000 0000 0000 0000 0001')).toBeNull();
    expect(parsePhilSysCardNumber('0000-0000-0000-0000-0001')).toBeNull();
  });

  it('refuses other groupings and a number with a letter in it', () => {
    expect(parsePhilSysCardNumber('00000000 00000001')).toBeNull();
    expect(parsePhilSysCardNumber('00000-000-0000-0001')).toBeNull();
    expect(parsePhilSysCardNumber('0000-O000-0000-0001')).toBeNull();
    expect(parsePhilSysCardNumber('no number here')).toBeNull();
    expect(parsePhilSysCardNumber('')).toBeNull();
  });

  it('does not join a number across a line break', () => {
    expect(parsePhilSysCardNumber('0000-0000\n0000-0001')).toBeNull();
  });

  describe('the 12-digit PhilSys Number is never returned', () => {
    it('a 12-digit run alone is null, in every grouping', () => {
      expect(parsePhilSysCardNumber('000000000012')).toBeNull();
      expect(parsePhilSysCardNumber('0000-0000-0012')).toBeNull();
      expect(parsePhilSysCardNumber('0000 0000 0012')).toBeNull();
    });

    it('text with both returns the card number, never the 12 digits, in either order', () => {
      expect(parsePhilSysCardNumber(`0000 0000 0012\n${PCN}`)).toBe(PCN_DIGITS);
      expect(parsePhilSysCardNumber(`${PCN}\n0000 0000 0012`)).toBe(PCN_DIGITS);
      expect(parsePhilSysCardNumber(`PSN 000000000012 PCN ${PCN}`)).toBe(PCN_DIGITS);
    });

    it('12 digits joined to other digits on a line are refused whole, not cut down', () => {
      expect(parsePhilSysCardNumber('0000 0000 0012 1111 2222 3333 4444')).toBeNull();
      expect(parsePhilSysCardNumber('000000000012 1990')).toBeNull();
      expect(parsePhilSysCardNumber('000000000012-1990')).toBeNull();
    });

    it('KNOWN LIMIT: 4-4-4 followed by exactly one 4-digit group reads as a card number', () => {
      // Text alone can't tell this from a real card number. The PhilSys Number is printed on the back and
      // AGAP scans the front. Pinned here so a change to this is seen, not because it is wanted.
      expect(parsePhilSysCardNumber('0000 0000 0012 1990')).toBe('0000000000121990');
    });

    it('a PhilHealth PIN is never a card number', () => {
      expect(parsePhilSysCardNumber('00-000000001-0')).toBeNull();
    });
  });
});

describe('looksLikeNationalId', () => {
  it('accepts either heading with a card number, even with OCR noise', () => {
    expect(looksLikeNationalId(CARD_TEXT)).toBe(true);
    expect(looksLikeNationalId(`PAMBANSANG PAGKAKAKILANLAN\n${PCN}`)).toBe(true);
    expect(looksLikeNationalId(`PHILIPPINE IDENTIFICATION CARD\n${PCN}`)).toBe(true);
    expect(looksLikeNationalId(`Pambansang  Pagkaka-kilanlan\n${PCN}`)).toBe(true);
  });

  it('needs both the heading and a valid card number', () => {
    expect(looksLikeNationalId('PAMBANSANG PAGKAKAKILANLAN\nDELA CRUZ')).toBe(false);
    expect(looksLikeNationalId(PCN)).toBe(false);
  });

  it('is false with the heading and only a 12-digit run', () => {
    expect(looksLikeNationalId('PAMBANSANG PAGKAKAKILANLAN\n0000 0000 0012')).toBe(false);
  });

  it('does not treat REPUBLIC OF THE PHILIPPINES as the heading', () => {
    expect(looksLikeNationalId(`REPUBLIC OF THE PHILIPPINES\nREPUBLIKA NG PILIPINAS\n${PCN}`)).toBe(false);
  });

  it('is false for PhilHealth text, a licence and a school ID, even with a 16-digit number', () => {
    const philhealth = [
      'REPUBLIC OF THE PHILIPPINES',
      'PhilHealth',
      'Philippine Health Insurance Corporation',
      '00-000000001-0',
      'DELA CRUZ, JUAN SANTOS',
    ].join('\n');
    const licence = [
      'REPUBLIC OF THE PHILIPPINES',
      'DEPARTMENT OF TRANSPORTATION',
      'LAND TRANSPORTATION OFFICE',
      "NON-PROFESSIONAL DRIVER'S LICENSE",
      'DELA CRUZ, JUAN SANTOS',
      'N01-00-000001',
    ].join('\n');
    const school = ['SAMPLE NATIONAL HIGH SCHOOL', 'STUDENT ID 2026-0001', 'JUAN S. DELA CRUZ'].join('\n');
    expect(looksLikeNationalId(philhealth)).toBe(false);
    expect(looksLikeNationalId(`${philhealth}\n${PCN}`)).toBe(false);
    expect(looksLikeNationalId(licence)).toBe(false);
    expect(looksLikeNationalId(`${licence}\n${PCN}`)).toBe(false);
    expect(looksLikeNationalId(school)).toBe(false);
    expect(looksLikeNationalId(`${school}\n${PCN}`)).toBe(false);
  });
});

describe('the two IDs do not cross over', () => {
  it('looksLikePhilHealthId is false for National ID text, even with a 12-digit run on it', () => {
    expect(looksLikePhilHealthId(CARD_TEXT)).toBe(false);
    expect(looksLikePhilHealthId(`${CARD_TEXT}\n000000000012`)).toBe(false);
  });

  it('the PhilHealth parsers find no number in a card number, and no name in a National ID', () => {
    expect(parsePhilHealthPin(PCN)).toBeNull();
    expect(parsePhilHealthName(CARD_TEXT)).toBeNull();
  });

  it('the National ID name parser finds no name on a PhilHealth card', () => {
    expect(parseNationalIdName('PhilHealth\n00-000000001-0\nDELA CRUZ, JUAN SANTOS\nJANUARY 01, 1990 - MALE')).toBeNull();
  });
});

describe('parseNationalIdName', () => {
  it('reads each labelled value from the line after its label', () => {
    expect(parseNationalIdName(CARD_TEXT)).toEqual(NAME);
  });

  it('reads a value on the label line itself', () => {
    const text = [
      'Apelyido/Last Name DELA CRUZ',
      'Mga Pangalan/Given Names: JUAN MIGUEL',
      'Gitnang Apelyido/Middle Name SANTOS',
      LABELS.birth,
    ].join('\n');
    expect(parseNationalIdName(text)).toEqual(NAME);
  });

  it('accepts one half of a bilingual label, and either case', () => {
    expect(parseNationalIdName('LAST NAME\nDELA CRUZ\nGIVEN NAMES\nJUAN MIGUEL\nMIDDLE NAME\nSANTOS')).toEqual(NAME);
    expect(parseNationalIdName('APELYIDO\nDELA CRUZ\nMGA PANGALAN\nJUAN MIGUEL\nGITNANG APELYIDO\nSANTOS')).toEqual(NAME);
    expect(parseNationalIdName('apelyido/last name\nDELA CRUZ\nmga pangalan/given names\nJUAN MIGUEL')).toEqual({
      last: 'DELA CRUZ',
      first: 'JUAN MIGUEL',
    });
  });

  it('tolerates a garbled half of a label, and junk lines and letters around a value', () => {
    expect(parseNationalIdName('Apelyid/Last Name\nDELA CRUZ\nMga Pangalan/Givn Names\nJUAN MIGUEL')).toEqual({
      last: 'DELA CRUZ',
      first: 'JUAN MIGUEL',
    });
    expect(parseNationalIdName('Apelyido/Last Name\n~~ ##\nF DELA CRUZ wa\nMga Pangalan/Given Names\n| JUAN MIGUEL')).toEqual({
      last: 'DELA CRUZ',
      first: 'JUAN MIGUEL',
    });
    expect(parseNationalIdName('Apelyido/Last Name | F\nDELA CRUZ\nMga Pangalan/Given Names\nJUAN')).toEqual({
      last: 'DELA CRUZ',
      first: 'JUAN',
    });
  });

  it('a card number on a label line does not hide the label', () => {
    expect(parseNationalIdName(`${PCN} Apelyido/Last Name\nDELA CRUZ\n${LABELS.given}\nJUAN`)).toEqual({
      last: 'DELA CRUZ',
      first: 'JUAN',
    });
  });

  describe('label traps', () => {
    it('GITNANG APELYIDO is the middle name, never the surname', () => {
      // The middle label alone: reading it as APELYIDO would make SANTOS the surname.
      expect(parseNationalIdName(`Gitnang Apelyido\nSANTOS\n${LABELS.given}\nJUAN`)).toBeNull();
      expect(parseNationalIdName(`GITNANG APELYIDO\nSANTOS\nAPELYIDO\nDELA CRUZ\n${LABELS.given}\nJUAN`)).toEqual({
        last: 'DELA CRUZ',
        first: 'JUAN',
        middle: 'SANTOS',
      });
      expect(parseNationalIdName(`GITNANG-APELYIDO\nSANTOS\n${LABELS.given}\nJUAN`)).toBeNull();
    });

    it('the middle name label before the others still fills only the middle name', () => {
      const text = [LABELS.middle, 'SANTOS', LABELS.given, 'JUAN', LABELS.last, 'DELA CRUZ'].join('\n');
      expect(parseNationalIdName(text)).toEqual({ last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' });
    });

    it('MIDDLE NAME and LAST NAME are not told apart by NAME alone', () => {
      expect(parseNationalIdName('MIDDLE NAME\nSANTOS\nGIVEN NAMES\nJUAN')).toBeNull();
      expect(parseNationalIdName('LAST NAME\nDELA CRUZ\nMIDDLE NAME\nSANTOS')).toBeNull();
      expect(parseNationalIdName('NAME\nDELA CRUZ\nNAME\nJUAN')).toBeNull();
    });

    it('a garbled label half beside a value is not taken as part of the name', () => {
      expect(parseNationalIdName('Apelyido/Last Nme\nGitnang Apelyido/Midd Name\nSANTOS')).toBeNull();
      expect(parseNationalIdName('APELYIDO/LAST NME\nDELA CRUZ\nMGA PANGALAN/GIVN NAMES\nJUAN\nGITNANG APELYIDO/MIDL NAME\nSANTOS')).toEqual({
        last: 'DELA CRUZ',
        first: 'JUAN',
        middle: 'SANTOS',
      });
      expect(parseNationalIdName(`APELYIDO/LAST\nDELA CRUZ\nMGA PANGALAN/GIVEN\nJUAN`)).toEqual({ last: 'DELA CRUZ', first: 'JUAN' });
    });

    it('a label half left behind when OCR loses the slash is not taken as the name', () => {
      expect(parseNationalIdName('APELYIDO LAST\nDELA CRUZ\nMGA PANGALAN GIVEN\nJUAN')).toEqual({ last: 'DELA CRUZ', first: 'JUAN' });
    });

    it('the first value for a label stands: a later label, such as a garbled GITNANG APELYIDO, cannot replace it', () => {
      const text = [LABELS.last, 'DELA CRUZ', LABELS.given, 'JUAN', 'G1TNANG APELYIDO', 'SANTOS'].join('\n');
      expect(parseNationalIdName(text)).toEqual({ last: 'DELA CRUZ', first: 'JUAN' });
    });

    it('a blank value does not take the next label as its value', () => {
      expect(parseNationalIdName(`${LABELS.last}\n${LABELS.given}\nJUAN`)).toBeNull();
    });
  });

  it('puts every given name in first, with no first/middle guessing', () => {
    expect(parseNationalIdName(card('REYES', 'MARIA CLARA TERESA', 'SANTOS'))).toEqual({
      last: 'REYES',
      first: 'MARIA CLARA TERESA',
      middle: 'SANTOS',
    });
  });

  it('a card with no middle name is valid', () => {
    const text = [PCN, LABELS.last, 'REYES', LABELS.given, 'JUAN', LABELS.middle, LABELS.birth, 'JANUARY 01, 1990'].join('\n');
    expect(parseNationalIdName(text)).toEqual({ last: 'REYES', first: 'JUAN' });
    expect(parseNationalIdName(`${LABELS.last}\nREYES\n${LABELS.given}\nJUAN`)).toEqual({ last: 'REYES', first: 'JUAN' });
    expect(parseNationalIdName(card('REYES', 'JUAN', 'N/A'))).toEqual({ last: 'REYES', first: 'JUAN' });
  });

  it('keeps multi-word surnames and a multi-word middle name whole', () => {
    expect(parseNationalIdName(card('DE LOS SANTOS', 'JUAN', 'DELA CRUZ'))).toEqual({
      last: 'DE LOS SANTOS',
      first: 'JUAN',
      middle: 'DELA CRUZ',
    });
    expect(parseNationalIdName(card('REYES-GARCIA', 'JUAN', 'SANTOS'))).toEqual({
      last: 'REYES-GARCIA',
      first: 'JUAN',
      middle: 'SANTOS',
    });
  });

  it('keeps Ñ as printed', () => {
    expect(parseNationalIdName(card('PEÑAFLOR', 'NIÑO', 'MUÑOZ'))).toEqual({ last: 'PEÑAFLOR', first: 'NIÑO', middle: 'MUÑOZ' });
  });

  it('reads the suffix after the surname or the given names, and keeps it out of them', () => {
    expect(parseNationalIdName(card('DELA CRUZ JR.', 'JUAN', 'SANTOS'))).toEqual({
      last: 'DELA CRUZ',
      first: 'JUAN',
      middle: 'SANTOS',
      suffix: 'JR.',
    });
    expect(parseNationalIdName(card('DELA CRUZ', 'JUAN III', 'SANTOS'))).toEqual({
      last: 'DELA CRUZ',
      first: 'JUAN',
      middle: 'SANTOS',
      suffix: 'III',
    });
  });

  it('returns null without both a last name and given names', () => {
    expect(parseNationalIdName('')).toBeNull();
    expect(parseNationalIdName('PAMBANSANG PAGKAKAKILANLAN\nDELA CRUZ\nJUAN')).toBeNull();
    expect(parseNationalIdName(`${LABELS.last}\nDELA CRUZ`)).toBeNull();
    expect(parseNationalIdName(`${LABELS.given}\nJUAN`)).toBeNull();
    expect(parseNationalIdName(`${LABELS.last}\n~~ ##\n~~\n~~\nDELA CRUZ\n${LABELS.given}\nJUAN`)).toBeNull();
  });

  describe('never reads the birth date or address (plan §5.1)', () => {
    const fields = (text: string) => JSON.stringify(parseNationalIdName(text));

    it('nothing after the name appears in the result', () => {
      const result = fields(CARD_TEXT);
      for (const word of ['JANUARY', '1990', 'BLK', 'SAMPLE', 'STREET', 'POBLACION', 'BOCAUE', 'BULACAN']) {
        expect(result).not.toContain(word);
      }
    });

    it('a blank middle name does not take the birth date or address as its value', () => {
      for (const next of [LABELS.birth, 'Date of Birth', 'PETSANG KAPANGANAKAN/ DATE OF BIRTH', 'Tirahan', 'ADDRESS']) {
        expect(parseNationalIdName(card('REYES', 'JUAN', next))).toEqual({ last: 'REYES', first: 'JUAN' });
      }
    });

    it('a label after the birth date or address is never read', () => {
      expect(parseNationalIdName(`${LABELS.last}\nREYES\n${LABELS.given}\nJUAN\n${LABELS.birth}\n${LABELS.middle}\nSANTOS`)).toEqual({
        last: 'REYES',
        first: 'JUAN',
      });
      expect(parseNationalIdName(`${LABELS.address}\nSAMPLE STREET\n${LABELS.last}\nREYES\n${LABELS.given}\nJUAN`)).toBeNull();
      expect(parseNationalIdName(`${LABELS.birth}\n${LABELS.last}\nREYES\n${LABELS.given}\nJUAN`)).toBeNull();
    });

    it('a birth or address label on the name line cuts the line there', () => {
      const text = `${LABELS.last}\nREYES\n${LABELS.given}\nJUAN Date of Birth JANUARY\n${LABELS.middle}\nSANTOS`;
      expect(parseNationalIdName(text)).toEqual({ last: 'REYES', first: 'JUAN' });
    });

    it('a date ends the reading even with its label garbled', () => {
      const end = 'SAMPLE STREET\nPOBLACION';
      for (const date of ['JANUARY 01, 1990', 'JANUARY O1, I99O', '01/01/1990', '1990']) {
        expect(parseNationalIdName(card('REYES', 'JUAN', `${date}\n${end}`, ''))).toEqual({ last: 'REYES', first: 'JUAN' });
      }
    });

    it('a label after a date with a garbled label is never read', () => {
      for (const date of ['JANUARY 01, 1990', 'JANUARY O1, I99O', '01/01/1990', '1990']) {
        const text = [LABELS.last, 'REYES', LABELS.given, 'JUAN', date, LABELS.middle, 'SANTOS'].join('\n');
        expect(parseNationalIdName(text)).toEqual({ last: 'REYES', first: 'JUAN' });
      }
    });

    it('a date with every digit misread as a letter is not taken as a middle name', () => {
      expect(parseNationalIdName(card('REYES', 'JUAN', 'JANUARY O1, I9OO', ''))).toEqual({ last: 'REYES', first: 'JUAN' });
    });

    it('a line with a run of digits is never a value', () => {
      expect(parseNationalIdName(`${LABELS.last}\nBLK 12 LOT 34\n${LABELS.given}\nJUAN`)).toBeNull();
    });

    it('a name that starts like a month is still read', () => {
      expect(parseNationalIdName(card('MAY', 'APRIL JOY', 'MARCH'))).toEqual({ last: 'MAY', first: 'APRIL JOY', middle: 'MARCH' });
      expect(parseNationalIdName(card('REYES', 'MARIA B.', 'SANTOS'))).toEqual({ last: 'REYES', first: 'MARIA B.', middle: 'SANTOS' });
      expect(parseNationalIdName(card('REYES', 'JUNE LI', 'SANTOS'))).toEqual({ last: 'REYES', first: 'JUNE LI', middle: 'SANTOS' });
    });

    it('a card number that looks like it holds a year does not end the reading', () => {
      expect(parseNationalIdName(`0000-1990-0000-0001 ${LABELS.last}\nREYES\n${LABELS.given}\nJUAN`)).toEqual({ last: 'REYES', first: 'JUAN' });
    });
  });

  it('gives the shared matcher what it needs', () => {
    const onId = parseNationalIdName(CARD_TEXT);
    expect(onId).not.toBeNull();
    expect(matchIdName({ last: 'Dela Cruz', first: 'Juan Miguel', middle: 'S' }, onId!).matches).toBe(true);
    expect(matchIdName({ last: 'Santos', first: 'Juan Miguel' }, onId!).matches).toBe(false);
  });

  it('is stateless: the same text reads the same every time', () => {
    expect(parseNationalIdName(CARD_TEXT)).toEqual(NAME);
    expect(parseNationalIdName(CARD_TEXT)).toEqual(NAME);
  });
});

describe('ID_DOCUMENT_RULES', () => {
  it('every type has all its fields', () => {
    for (const type of ID_DOCUMENT_TYPES) {
      const rules = ID_DOCUMENT_RULES[type];
      expect(typeof rules.looksLike).toBe('function');
      expect(typeof rules.parseNumber).toBe('function');
      expect(typeof rules.parseName).toBe('function');
      expect(ID_VERIFICATION_CONSENT_TYPES).toContain(rules.consentType);
      expect(Object.values(IdVerificationErrorCode)).toContain(rules.wrongCardCode);
      expect(ID_REJECTION_REASONS).toContain(rules.rejectionReason);
      expect(rules.label).toBeTruthy();
      expect(rules.numberPrompt).toBeTruthy();
      expect(typeof rules.approvalNeedsNumber).toBe('boolean');
    }
  });

  it('has no entry for an unknown type', () => {
    expect(Object.keys(ID_DOCUMENT_RULES).sort()).toEqual([...ID_DOCUMENT_TYPES].sort());
  });

  it('gives each type its own consent, wrong-card code and rejection reason', () => {
    const { PHILHEALTH, NATIONAL_ID } = ID_DOCUMENT_RULES;
    expect(PHILHEALTH.consentType).toBe('ID_VERIFICATION_PHILHEALTH');
    expect(NATIONAL_ID.consentType).toBe('ID_VERIFICATION_NATIONAL_ID');
    expect(PHILHEALTH.wrongCardCode).toBe(IdVerificationErrorCode.NOT_PHILHEALTH_ID);
    expect(NATIONAL_ID.wrongCardCode).toBe(IdVerificationErrorCode.NOT_NATIONAL_ID);
    expect(PHILHEALTH.rejectionReason).toBe('NOT_PHILHEALTH');
    expect(NATIONAL_ID.rejectionReason).toBe('NOT_NATIONAL_ID');
  });

  it('each type runs only its own parsers', () => {
    const philhealthText = 'PhilHealth\n00-000000001-0\nDELA CRUZ, JUAN SANTOS';
    expect(ID_DOCUMENT_RULES.NATIONAL_ID.looksLike(CARD_TEXT)).toBe(true);
    expect(ID_DOCUMENT_RULES.PHILHEALTH.looksLike(CARD_TEXT)).toBe(false);
    expect(ID_DOCUMENT_RULES.NATIONAL_ID.parseNumber(CARD_TEXT)).toBe(PCN_DIGITS);
    expect(ID_DOCUMENT_RULES.PHILHEALTH.parseNumber(CARD_TEXT)).toBeNull();
    expect(ID_DOCUMENT_RULES.PHILHEALTH.looksLike(philhealthText)).toBe(true);
    expect(ID_DOCUMENT_RULES.NATIONAL_ID.looksLike(philhealthText)).toBe(false);
    expect(ID_DOCUMENT_RULES.PHILHEALTH.parseNumber(philhealthText)).toBe('000000000010');
    expect(ID_DOCUMENT_RULES.NATIONAL_ID.parseNumber(philhealthText)).toBeNull();
  });
});

describe('the heading', () => {
  it('accepts the two Filipino words apart, since OCR can put junk between them', () => {
    expect(ID_DOCUMENT_RULES.NATIONAL_ID.hasHeading('PAMBANSANG x7 |\nDELA CRUZ\nPAGKAKAKILANLAN')).toBe(true);
    expect(looksLikeNationalId(`PAMBANSANG x7 |\nPAGKAKAKILANLAN\n${PCN}`)).toBe(true);
  });

  it('does not accept one word alone, or the English words apart: other IDs print those', () => {
    expect(ID_DOCUMENT_RULES.NATIONAL_ID.hasHeading('PAMBANSANG')).toBe(false);
    expect(ID_DOCUMENT_RULES.NATIONAL_ID.hasHeading('PAGKAKAKILANLAN')).toBe(false);
    expect(looksLikeNationalId(`REPUBLIC OF THE PHILIPPINES\nPROFESSIONAL IDENTIFICATION CARD\n${PCN}`)).toBe(false);
  });

  it('reads each ID\'s own heading only', () => {
    expect(ID_DOCUMENT_RULES.PHILHEALTH.hasHeading('PhilHealth')).toBe(true);
    expect(ID_DOCUMENT_RULES.PHILHEALTH.hasHeading('PAMBANSANG PAGKAKAKILANLAN')).toBe(false);
    expect(ID_DOCUMENT_RULES.NATIONAL_ID.hasHeading('PhilHealth')).toBe(false);
  });
});

describe('combining reads of one image', () => {
  const rules = ID_DOCUMENT_RULES.NATIONAL_ID;
  const HEADING_NUMBER = `PAMBANSANG PAGKAKAKILANLAN\n${PCN}`;
  const NAME = 'Apelyido/Last Name\nDELA CRUZ\nMga Pangalan/Given Names\nJUAN';

  it('takes the number and name from whichever read has them', () => {
    expect(combineIdReads(rules, [HEADING_NUMBER, NAME])).toEqual({
      headingSeen: true,
      number: PCN_DIGITS,
      name: { last: 'DELA CRUZ', first: 'JUAN' },
      numberConflict: false,
    });
  });

  it('counts nothing without the heading in some read', () => {
    expect(combineIdReads(rules, [PCN, NAME])).toEqual({ headingSeen: false, number: null, name: null, numberConflict: false });
  });

  it('agreeing reads are one number, and differing reads are none', () => {
    expect(combineIdReads(rules, [HEADING_NUMBER, HEADING_NUMBER]).number).toBe(PCN_DIGITS);
    const conflict = combineIdReads(rules, [HEADING_NUMBER, `${NAME}\n0000-0000-0000-0002`]);
    expect(conflict).toMatchObject({ number: null, numberConflict: true });
  });

  it('prefers the name from the read passed first', () => {
    const other = 'Apelyido/Last Name\nREYES\nMga Pangalan/Given Names\nANA';
    expect(combineIdReads(rules, [HEADING_NUMBER, other, NAME]).name).toEqual({ last: 'REYES', first: 'ANA' });
  });

  it('never takes a 12-digit run as the number', () => {
    expect(combineIdReads(rules, ['PAMBANSANG PAGKAKAKILANLAN\n0000 0000 0012', NAME]).number).toBeNull();
  });
});

describe('how much of the phone reading the server backs up', () => {
  const rules = ID_DOCUMENT_RULES.NATIONAL_ID;
  const PHONE = `PAMBANSANG PAGKAKAKILANLAN\n${PCN}\nApelyido/Last Name\nDELA CRUZ\nMga Pangalan/Given Names\nJUAN`;

  it('counts the number groups and name words the server also read', () => {
    expect(phoneReadSupport(rules, PHONE, [`${PCN}\nDELA CRUZ JUAN`])).toEqual({ phoneNumberSeen: '4/4', phoneNameSeen: '3/3' });
    expect(phoneReadSupport(rules, PHONE, ['0000 CRUZ'])).toEqual({ phoneNumberSeen: '3/4', phoneNameSeen: '1/3' });
    expect(phoneReadSupport(rules, PHONE, [])).toEqual({ phoneNumberSeen: '0/4', phoneNameSeen: '0/3' });
  });

  it('says so when the phone found no number or name', () => {
    expect(phoneReadSupport(rules, 'nothing useful', ['x'])).toEqual({ phoneNumberSeen: 'none', phoneNameSeen: 'none' });
  });

  it('holds counts only', () => {
    const logged = JSON.stringify(phoneReadSupport(rules, PHONE, [PHONE]));
    for (const secret of ['0001', 'DELA', 'CRUZ', 'JUAN']) expect(logged).not.toContain(secret);
  });
});

describe('what a failed read may log', () => {
  const FULL = [
    'REPUBLIKA NG PILIPINAS',
    'PAMBANSANG PAGKAKAKILANLAN',
    'Philippine Identification Card',
    PCN,
    'Apelyido/Last Name',
    'DELA CRUZ',
    'Mga Pangalan/Given Names',
    'JUAN',
    'Gitnang Apelyido/Middle Name',
    'SANTOS',
    'Petsa ng Kapanganakan/Date of Birth',
    'JANUARY 01, 1990',
  ].join('\n');

  it('reports each part it found on a full read', () => {
    expect(nationalIdReadSignals(FULL)).toEqual({
      heading: true,
      headingWords: 'pam+pag+phi+ide',
      labels: 'last,given,middle',
      nameValues: 'last,given,middle',
      endedBy: 'stopLabel',
      stopLabel: true,
      digitRuns: '4-4-4-4',
      lines: 12,
    });
  });

  it('reports what is missing on a poor read', () => {
    expect(nationalIdReadSignals('PAMBANSANG PAGKA\nKILANLAN\ng i y L')).toEqual({
      heading: false,
      headingWords: 'pam',
      labels: 'none',
      nameValues: 'none',
      endedBy: 'none',
      stopLabel: false,
      digitRuns: 'none',
      lines: 3,
    });
  });

  it('shows labels found with no value under them, and a stray year ending the reading early', () => {
    const signals = nationalIdReadSignals(['Apelyido/Last Name', 'DELA CRUZ', 'ab 2019 cd', 'Mga Pangalan/Given Names', 'JUAN'].join('\n'));
    expect(signals).toMatchObject({ labels: 'last,given', nameValues: 'last', endedBy: 'date' });
  });

  it('never lists a name among the values it found', () => {
    expect(JSON.stringify(nationalIdReadSignals(FULL))).not.toMatch(/DELA|JUAN|SANTOS/);
  });

  it('does not take GITNANG APELYIDO for the last name label', () => {
    expect(nationalIdReadSignals('Gitnang Apelyido').labels).toBe('middle');
  });

  it.each([
    ['0000-0000-0000-0001', '4-4-4-4'],
    ['0000000000000001', '16'],
    ['0000 0000 0012', '4-4-4'],
    ['0000-0000-000-0001', '4-4-3-4'],
    ['00-000000001-0', '2-9-1'],
    ['0000-0000-0000-0001\n0000 0000 0012', '4-4-4-4,4-4-4'],
  ])('shows %s only as its shape', (text, shape) => {
    expect(digitRunShapes(text)).toBe(shape);
  });

  it('leaves out short runs, and caps how many it lists', () => {
    expect(digitRunShapes('01\n1990\n1234567')).toBe('none');
    expect(digitRunShapes(Array(6).fill('12345678').join('\n'))).toBe('8,8,8,8');
  });

  it('a PhilHealth read reports only its digit shapes: the National ID labels mean nothing there', () => {
    expect(ID_DOCUMENT_RULES.PHILHEALTH.readSignals(FULL)).toEqual({ digitRuns: '4-4-4-4' });
  });

  it('holds no name, card text or digit of the number, for either ID', () => {
    for (const type of ID_DOCUMENT_TYPES) {
      const logged = JSON.stringify(ID_DOCUMENT_RULES[type].readSignals(`${FULL}\n1234-5678-9012-3456`));
      for (const secret of ['DELA', 'JUAN', 'SANTOS', 'JANUARY', 'PAMBANSANG', '0001', '1234', '5678', '9012', '3456', '1990']) {
        expect(logged).not.toContain(secret);
      }
    }
  });
});

describe('ID consent types', () => {
  it('keeps the PhilHealth value that existing rows and tests use', () => {
    expect(ID_VERIFICATION_CONSENT_TYPE).toBe('ID_VERIFICATION_PHILHEALTH');
  });

  it('recognises both ID consents and nothing else', () => {
    expect(isIdVerificationConsentType('ID_VERIFICATION_PHILHEALTH')).toBe(true);
    expect(isIdVerificationConsentType('ID_VERIFICATION_NATIONAL_ID')).toBe(true);
    expect(isIdVerificationConsentType('MEDICAL_DATA')).toBe(false);
    expect(isIdVerificationConsentType('')).toBe(false);
  });
});
