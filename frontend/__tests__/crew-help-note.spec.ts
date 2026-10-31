import { crewHelpNote } from '@/lib/crew-help-note';

describe('crewHelpNote (unit field flow plan, Phase 2 step 5)', () => {
  it("returns the crew's note from a crew help notice", () => {
    expect(crewHelpNote({
      event_type: 'CREW_HELP_REQUESTED',
      data_payload: { need: 'AMBULANCE', dispatchId: 'd-1', note: '  two burned, one trapped  ' },
    })).toBe('two burned, one trapped');
  });

  it('is null when there is no note, a blank note or a non-string note', () => {
    expect(crewHelpNote({ event_type: 'CREW_HELP_REQUESTED', data_payload: { need: 'AMBULANCE' } })).toBeNull();
    expect(crewHelpNote({ event_type: 'CREW_HELP_REQUESTED', data_payload: { note: '   ' } })).toBeNull();
    expect(crewHelpNote({ event_type: 'CREW_HELP_REQUESTED', data_payload: { note: 42 } })).toBeNull();
    expect(crewHelpNote({ event_type: 'CREW_HELP_REQUESTED', data_payload: null })).toBeNull();
  });

  it('never shows a note-like field from another kind of notice', () => {
    expect(crewHelpNote({ event_type: 'SURGE_RECOMMENDED', data_payload: { note: 'x' } })).toBeNull();
  });
});
