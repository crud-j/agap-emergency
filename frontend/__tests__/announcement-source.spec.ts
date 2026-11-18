import { ISSUERS, getTemplate, suggestSource, type AnnouncementTemplate } from '@/features/announcements/templates';

const MAYOR = { EN: ISSUERS.MAYOR.EN };
const tpl = (key: string): AnnouncementTemplate => {
  const t = getTemplate(key);
  if (!t) throw new Error(`no template ${key}`);
  return t;
};

describe('suggestSource (MOD-53 composer)', () => {
  it('river level: gauge reading time, with the named gauge when given', () => {
    expect(suggestSource(tpl('RIVER_LEVEL'), { observedAt: '2026-11-16T10:30' }, MAYOR)).toBe(
      'MDRRMO Bocaue River gauge reading, November 16, 2026, 10:30 AM',
    );
    expect(
      suggestSource(tpl('RIVER_LEVEL'), { observedAt: '2026-11-16T14:05', gauge: 'Bocaue Bridge gauge' }, MAYOR),
    ).toBe('MDRRMO reading at Bocaue Bridge gauge, November 16, 2026, 2:05 PM');
  });

  it('rainfall: PAGASA warning level and issue time', () => {
    expect(suggestSource(tpl('RAINFALL'), { level: 'ORANGE', issuedAt: '2026-11-16T05:00' }, MAYOR)).toBe(
      'PAGASA Orange Heavy Rainfall Warning, issued November 16, 2026, 5:00 AM',
    );
  });

  it('flood, evacuation and road closure use the confirmed time and issuing office', () => {
    expect(suggestSource(tpl('FLOOD'), { observedAt: '2026-11-16T08:00' }, MAYOR)).toBe(
      'MDRRMO field report, as of November 16, 2026, 8:00 AM',
    );
    expect(suggestSource(tpl('EVACUATION'), { type: 'FORCED', effectiveAt: '2026-11-16T09:00' }, MAYOR)).toBe(
      `Forced evacuation order, ${ISSUERS.MAYOR.EN}, effective November 16, 2026, 9:00 AM`,
    );
    expect(suggestSource(tpl('ROAD_CLOSURE'), { start: '2026-11-16T22:00' }, MAYOR)).toBe(
      `Traffic advisory, ${ISSUERS.MAYOR.EN}, from November 16, 2026, 10:00 PM`,
    );
  });

  it('class suspension cites the order or memo itself', () => {
    expect(suggestSource(tpl('CLASS_SUSPENSION'), { basis: 'Executive Order No. 12, s. 2026' }, MAYOR)).toBe(
      'Executive Order No. 12, s. 2026',
    );
  });

  it('general advisory cites the issuing office', () => {
    expect(suggestSource(tpl('GENERAL'), {}, MAYOR)).toBe(`Advisory of the ${ISSUERS.MAYOR.EN}`);
  });

  it('stays empty until the details it needs are entered (never a made-up source)', () => {
    expect(suggestSource(tpl('RIVER_LEVEL'), {}, MAYOR)).toBe('');
    expect(suggestSource(tpl('RAINFALL'), { level: 'ORANGE' }, MAYOR)).toBe('');
    expect(suggestSource(tpl('EVACUATION'), { effectiveAt: '2026-11-16T09:00' }, { EN: '' })).toBe('');
    expect(suggestSource(tpl('CLASS_SUSPENSION'), {}, MAYOR)).toBe('');
  });
});
