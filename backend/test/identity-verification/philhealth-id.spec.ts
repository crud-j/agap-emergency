import {
  composeFullName,
  looksLikePhilHealthId,
  matchIdName,
  normalizeNamePart,
  parsePhilHealthName,
  parsePhilHealthPin,
  type IdName,
} from '@agap/shared';

// MOD-01 / plan §6 — PhilHealth ID reading and name matching. Invented names and fake PINs only.
const ID: IdName = { last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' };

/** Made-up OCR text in the Phase 0 card layout, with the kind of junk tesseract adds. */
const CARD_TEXT = [
  ': REPUBLIC OF THE PHILIPPINES £ PhilHealth',
  '| # wv. Philippine Health Insurance Corporation 3 = be',
  'n= j',
  '',
  'am | 00-000000001-0',
  '',
  ': F ~~ DELA CRUZ, JUAN SANTOS',
  '',
  'Eo | | JANUARY 01.1990 -MALE .. wa',
  '2 qe 5 5 a ) BLK 1 LOT 2 SAMPLE STREET, POBLACION,',
  ': UL _— BOCAUE, BULACAN - 3018 Re',
].join('\n');

describe('normalizeNamePart', () => {
  it('uppercases, strips accents and punctuation, and expands STA/STO', () => {
    expect(normalizeNamePart('  Dela  Cruz ')).toBe('DELA CRUZ');
    expect(normalizeNamePart('Peñaflor')).toBe('PENAFLOR');
    expect(normalizeNamePart('Sto. Niño')).toBe('SANTO NINO');
    expect(normalizeNamePart('Sta.Maria')).toBe('SANTA MARIA');
    expect(normalizeNamePart('Reyes-Garcia')).toBe('REYES GARCIA');
    expect(normalizeNamePart('Jr.')).toBe('JR');
  });
});

describe('parsePhilHealthPin', () => {
  it('reads the 2-9-1 PIN with dashes, spaces or no separator', () => {
    expect(parsePhilHealthPin('PIN 00-000000001-0')).toBe('000000000010');
    expect(parsePhilHealthPin('00 000000001 0')).toBe('000000000010');
    expect(parsePhilHealthPin('000000000010')).toBe('000000000010');
    expect(parsePhilHealthPin('am | 00-000000001-0 x')).toBe('000000000010');
  });

  it('rejects 11 or 13 digits and other groupings', () => {
    expect(parsePhilHealthPin('00-00000001-0')).toBeNull();
    expect(parsePhilHealthPin('00000000001')).toBeNull();
    expect(parsePhilHealthPin('0000000000100')).toBeNull();
    expect(parsePhilHealthPin('00-000000001-00')).toBeNull();
    expect(parsePhilHealthPin('0000-0000-0001-0000')).toBeNull(); // PhilSys card number
    expect(parsePhilHealthPin('no number here')).toBeNull();
  });
});

describe('looksLikePhilHealthId', () => {
  it('accepts the PhilHealth heading with a PIN, even with OCR noise', () => {
    expect(looksLikePhilHealthId(CARD_TEXT)).toBe(true);
    expect(looksLikePhilHealthId('PHILIPPINE HEALTH INSURANCE CORPORATION\n00 000000001 0')).toBe(true);
    expect(looksLikePhilHealthId('Phil Health\n00-000000001-0')).toBe(true);
  });

  it('needs both the heading and the PIN', () => {
    expect(looksLikePhilHealthId('PhilHealth\nDELA CRUZ, JUAN SANTOS')).toBe(false);
    expect(looksLikePhilHealthId('REPUBLIC OF THE PHILIPPINES\n00-000000001-0')).toBe(false);
  });

  it("rejects a driver's licence and a school ID", () => {
    const licence = [
      'REPUBLIC OF THE PHILIPPINES',
      'DEPARTMENT OF TRANSPORTATION',
      'LAND TRANSPORTATION OFFICE',
      "NON-PROFESSIONAL DRIVER'S LICENSE",
      'DELA CRUZ, JUAN SANTOS',
      'N01-00-000001',
    ].join('\n');
    const school = [
      'SAMPLE NATIONAL HIGH SCHOOL',
      'STUDENT ID 2026-0001',
      'LRN 000000000001',
      'JUAN S. DELA CRUZ',
    ].join('\n');
    expect(looksLikePhilHealthId(licence)).toBe(false);
    expect(looksLikePhilHealthId(school)).toBe(false);
  });
});

describe('parsePhilHealthName', () => {
  it('reads LAST, FIRST MIDDLE after the PIN and ignores the junk, birth date and address', () => {
    expect(parsePhilHealthName(CARD_TEXT)).toEqual({ last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' });
  });

  it('keeps a two-word first name and a particle-led middle name together', () => {
    expect(parsePhilHealthName('00-000000001-0\nREYES, MARIA CLARA SANTOS')).toEqual({
      last: 'REYES',
      first: 'MARIA CLARA',
      middle: 'SANTOS',
    });
    expect(parsePhilHealthName('00-000000001-0\nREYES, JUAN DE LOS SANTOS')).toEqual({
      last: 'REYES',
      first: 'JUAN',
      middle: 'DE LOS SANTOS',
    });
  });

  it('reads the suffix wherever the card prints it', () => {
    expect(parsePhilHealthName('00-000000001-0\nDELA CRUZ JR., JUAN SANTOS')).toEqual({ ...ID, suffix: 'JR.' });
    expect(parsePhilHealthName('00-000000001-0\nDELA CRUZ, JUAN SANTOS III')).toEqual({ ...ID, suffix: 'III' });
  });

  it('tolerates extra spaces, a line break after LAST, and a comma misread as a period', () => {
    expect(parsePhilHealthName('00-000000001-0\n  DELA   CRUZ ,   JUAN  SANTOS ')).toEqual(ID);
    expect(parsePhilHealthName('00-000000001-0\nDELA CRUZ,\nJUAN SANTOS\nJANUARY 01, 1990')).toEqual(ID);
    expect(parsePhilHealthName('00-000000001-0\n| DELA CRUZ. JUAN SANTOS')).toEqual(ID);
  });

  it('keeps Ñ as printed and returns no middle name when there is one given name', () => {
    expect(parsePhilHealthName('00-000000001-0\nPEÑAFLOR, JUAN')).toEqual({ last: 'PEÑAFLOR', first: 'JUAN' });
  });

  it('returns null when there is no name line', () => {
    expect(parsePhilHealthName('PhilHealth\n00-000000001-0\nJANUARY 01, 1990 - MALE')).toBeNull();
    expect(parsePhilHealthName('')).toBeNull();
  });

  describe('never reads the address as the name (plan §5.1)', () => {
    const ADDRESS = 'SITIO PAG-ASA, BUNLO\nBOCAUE, BULACAN 3018';

    it('a comma misread as a period on the name line still finds the name, not the address', () => {
      expect(
        parsePhilHealthName(`PhilHealth\n00-000000001-0\nDELA CRUZ. JUAN SANTOS\nJANUARY 01, 1990 - MALE\n${ADDRESS}`),
      ).toEqual(ID);
    });

    it('a name line OCR lost entirely is null, so the scan is retried', () => {
      expect(parsePhilHealthName(`PhilHealth\n00-000000001-0\n~~ ###\nJANUARY 01, 1990 - MALE\n${ADDRESS}`)).toBeNull();
      expect(parsePhilHealthName(`PhilHealth\n00-000000001-0\nJANUARY 01, 1990 - FEMALE\nPUROK 1, BINANG 1ST`)).toBeNull();
    });

    it('a birth date whose digits OCR misread still ends the search', () => {
      expect(parsePhilHealthName(`PhilHealth\n00-000000001-0\n~~\nJANUARY O1, I99O - MALE\n${ADDRESS}`)).toBeNull();
      expect(parsePhilHealthName(`PhilHealth\n00-000000001-0\nJANUARY O1. I99O\nSEX - FEMALE\n${ADDRESS}`)).toBeNull();
    });

    it('still reads a normal card, and a surname that is also a month', () => {
      expect(parsePhilHealthName(`PhilHealth\n00-000000001-0\nDELA CRUZ, JUAN SANTOS\nJANUARY 01, 1990 - MALE\n${ADDRESS}`)).toEqual(ID);
      expect(parsePhilHealthName(`00-000000001-0\nMAY, JUAN SANTOS\nMAY 01, 1990 - MALE\n${ADDRESS}`)).toEqual({
        last: 'MAY',
        first: 'JUAN',
        middle: 'SANTOS',
      });
    });

    it('still finds a name OCR placed before the PIN', () => {
      expect(parsePhilHealthName(`PhilHealth\nDELA CRUZ, JUAN SANTOS\n00-000000001-0\nJANUARY 01, 1990 - MALE\n${ADDRESS}`)).toEqual(ID);
    });
  });
});

describe('matchIdName', () => {
  const match = (typed: IdName, onId: IdName = ID) => matchIdName(typed, onId);

  it('matches regardless of case and spacing', () => {
    expect(match({ last: 'Dela Cruz', first: 'Juan', middle: 'Santos' }).matches).toBe(true);
    expect(match({ last: ' dela  cruz ', first: 'JUAN', middle: 'santos' }).matches).toBe(true);
  });

  it('compares multi-word surnames as a whole', () => {
    const joined = match({ last: 'Delacruz', first: 'Juan', middle: 'Santos' });
    expect(joined.matches).toBe(false);
    expect(joined.parts.last).toBe(false);
    expect(match({ last: 'Cruz', first: 'Juan', middle: 'Santos' }).matches).toBe(false);
  });

  it('treats Ñ and N as the same letter', () => {
    const onId: IdName = { last: 'PEÑAFLOR', first: 'JUAN' };
    expect(match({ last: 'Penaflor', first: 'Juan' }, onId).matches).toBe(true);
    expect(match({ last: 'Peñaflor', first: 'Juan' }, { last: 'PENAFLOR', first: 'JUAN' }).matches).toBe(true);
  });

  it('matches Sto. Niño however it is written', () => {
    const onId: IdName = { last: 'STO. NIÑO', first: 'JUAN' };
    expect(match({ last: 'Santo Nino', first: 'Juan' }, onId).matches).toBe(true);
    expect(match({ last: 'Sto Niño', first: 'Juan' }, onId).matches).toBe(true);
  });

  it('accepts the middle name in full, as an initial, or left blank, and rejects a different one', () => {
    expect(match({ last: 'Dela Cruz', first: 'Juan', middle: 'Santos' }).parts.middle).toBe('match');
    expect(match({ last: 'Dela Cruz', first: 'Juan', middle: 'S.' })).toEqual({
      matches: true,
      parts: { last: true, first: true, middle: 'initial', suffix: true },
    });
    expect(match({ last: 'Dela Cruz', first: 'Juan' })).toEqual({
      matches: true,
      parts: { last: true, first: true, middle: 'omitted', suffix: true },
    });
    const wrong = match({ last: 'Dela Cruz', first: 'Juan', middle: 'Reyes' });
    expect(wrong.matches).toBe(false);
    expect(wrong.parts.middle).toBe('mismatch');
  });

  it('accepts initials of a compound middle name', () => {
    const onId: IdName = { last: 'REYES', first: 'JUAN', middle: 'DELA CRUZ' };
    expect(match({ last: 'Reyes', first: 'Juan', middle: 'D.' }, onId).parts.middle).toBe('initial');
    expect(match({ last: 'Reyes', first: 'Juan', middle: 'DC' }, onId).parts.middle).toBe('initial');
  });

  it('matches Jr. and JR, and requires the suffix only when the ID shows one', () => {
    const onId: IdName = { ...ID, suffix: 'JR' };
    expect(match({ last: 'Dela Cruz', first: 'Juan', suffix: 'Jr.' }, onId).matches).toBe(true);
    const missing = match({ last: 'Dela Cruz', first: 'Juan' }, onId);
    expect(missing.matches).toBe(false);
    expect(missing.parts.suffix).toBe(false);
    expect(match({ last: 'Dela Cruz', first: 'Juan', suffix: 'Sr.' }, onId).matches).toBe(false);
    expect(match({ last: 'Dela Cruz', first: 'Juan', suffix: 'Jr.' }).matches).toBe(true);
  });

  it('requires a two-word first name in full', () => {
    const onId: IdName = { last: 'REYES', first: 'MARIA CLARA', middle: 'SANTOS' };
    expect(match({ last: 'Reyes', first: 'Maria Clara', middle: 'Santos' }, onId).matches).toBe(true);
    expect(match({ last: 'Reyes', first: 'Maria Clara' }, onId).matches).toBe(true);
    const short = match({ last: 'Reyes', first: 'Maria', middle: 'Santos' }, onId);
    expect(short.matches).toBe(false);
    expect(short.parts.first).toBe(false);
  });

  it('allows the card split between first and middle name to differ from the typed one', () => {
    // The card prints FIRST MIDDLE with no separator, so MARIA + CLARA SANTOS can't be told apart from
    // MARIA CLARA + SANTOS; only splits with a plausible middle name are allowed.
    const onId: IdName = { last: 'REYES', first: 'MARIA', middle: 'CLARA SANTOS' };
    expect(match({ last: 'Reyes', first: 'Maria Clara', middle: 'Santos' }, onId).matches).toBe(true);
    expect(match({ last: 'Reyes', first: 'Maria' }, { last: 'REYES', first: 'MARIA CLARA', middle: 'SANTOS' }).matches).toBe(
      false,
    );
  });

  it('fails when first and last names are swapped', () => {
    const swapped = match({ last: 'Juan', first: 'Dela Cruz', middle: 'Santos' });
    expect(swapped.matches).toBe(false);
    expect(swapped.parts).toMatchObject({ last: false, first: false });
  });

  it('allows one OCR slip in a word of 5+ letters but not in a shorter word', () => {
    expect(match({ last: 'Dela Cruz', first: 'Juan', middle: 'Santos' }, { ...ID, middle: 'SANT0S' }).matches).toBe(true);
    expect(match({ last: 'Bautista', first: 'Juan' }, { last: 'BAUT1STA', first: 'JUAN' }).matches).toBe(true);
    expect(match({ last: 'Bautista', first: 'Juan' }, { last: 'BAUT1ST4', first: 'JUAN' }).matches).toBe(false);
    expect(match({ last: 'Dela Cruz', first: 'Juan', middle: 'Santos' }, { ...ID, last: 'DELA CRU2' }).matches).toBe(false);
  });

  it('matches the name parsed from the card text', () => {
    const onId = parsePhilHealthName(CARD_TEXT);
    expect(onId).not.toBeNull();
    expect(matchIdName({ last: 'Dela Cruz', first: 'Juan', middle: 'S' }, onId!).matches).toBe(true);
  });
});

describe('composeFullName', () => {
  it('builds First Middle Last Suffix with single spaces', () => {
    expect(composeFullName({ last: 'Dela Cruz', first: 'Juan', middle: 'Santos', suffix: 'Jr.' })).toBe(
      'Juan Santos Dela Cruz Jr.',
    );
    expect(composeFullName({ last: ' Dela  Cruz ', first: 'Maria  Clara' })).toBe('Maria Clara Dela Cruz');
    expect(composeFullName({ last: 'Reyes', first: 'Juan', middle: '', suffix: 'III' })).toBe('Juan Reyes III');
  });
});
