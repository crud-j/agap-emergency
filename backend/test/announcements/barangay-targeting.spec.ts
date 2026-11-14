import { BOCAUE_BARANGAY_NAMES, announcementReachesBarangay, canonicalBarangay } from '@agap/shared';

/** MOD-53 barangay targeting: one list, one matching rule for SMS and push. */
describe('canonicalBarangay', () => {
  it('returns every official name unchanged', () => {
    for (const name of BOCAUE_BARANGAY_NAMES) expect(canonicalBarangay(name)).toBe(name);
  });

  it.each([
    ['tambobong', 'Tambubong'],
    ['BIÑANG 1ST', 'Biñang 1st'],
    ['Binang 1st', 'Biñang 1st'],
    ['binang 2', 'Biñang 2nd'],
    ['  lolomboy ', 'Lolomboy'],
  ])('maps %p to %p', (raw, official) => {
    expect(canonicalBarangay(raw)).toBe(official);
  });

  it.each([null, undefined, '', '   ', 'Saog', 'Ganap', 'Marilao'])('returns null for %p', (raw) => {
    expect(canonicalBarangay(raw as string | null | undefined)).toBeNull();
  });
});

describe('announcementReachesBarangay', () => {
  it('reaches everyone when there are no targets', () => {
    expect(announcementReachesBarangay([], 'Wakas')).toBe(true);
    expect(announcementReachesBarangay([], null)).toBe(true);
  });

  it('reaches only the targeted barangays among people whose barangay is known', () => {
    expect(announcementReachesBarangay(['Lolomboy', 'Bunlo'], 'Bunlo')).toBe(true);
    expect(announcementReachesBarangay(['Lolomboy', 'Bunlo'], 'Wakas')).toBe(false);
  });

  it('matches old spellings on either side', () => {
    expect(announcementReachesBarangay(['Tambobong'], 'Tambubong')).toBe(true);
    expect(announcementReachesBarangay(['Tambubong'], 'tambobong')).toBe(true);
  });

  it('reaches a person whose barangay is unknown or not a Bocaue name', () => {
    expect(announcementReachesBarangay(['Lolomboy'], null)).toBe(true);
    expect(announcementReachesBarangay(['Lolomboy'], 'Saog')).toBe(true);
  });

  it('treats a target list with no Bocaue names as municipality-wide', () => {
    expect(announcementReachesBarangay(['Nowhere'], 'Wakas')).toBe(true);
  });
});
