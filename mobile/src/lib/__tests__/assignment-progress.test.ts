/// <reference types="jest" />
import { fil } from '@/src/i18n/translations';
import { ApiError } from '@/src/services/api/http';
import {
  isTransportOpenError,
  nextAssignmentActions,
  shouldShareLocation,
} from '../assignment-progress';

const labelsOf = (actions: ReturnType<typeof nextAssignmentActions>) => actions.map((a) => a.label);

describe('nextAssignmentActions', () => {
  it('walks the crew through accept → en route → on scene → transporting / treating', () => {
    expect(labelsOf(nextAssignmentActions('SENT'))).toEqual(['Accept Assignment']);
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'DISPATCHED'))).toEqual(['Mark En Route']);
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'EN_ROUTE'))).toEqual(['Mark On Scene']);
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'ON_SCENE'))).toEqual(['Transporting', 'Treating on Scene']);
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'ASSISTING'))).toEqual(['Mark Resolved']);
  });

  describe('TRANSPORTING (Prompt 10, plan §15 item 6)', () => {
    it('an open transport: "Arrived at hospital" is the only action; Mark Resolved is not offered', () => {
      const actions = nextAssignmentActions('ACCEPTED', 'TRANSPORTING', { open: true });
      expect(actions).toEqual([{ kind: 'arrive', label: 'Arrived at hospital', icon: 'medical' }]);
    });

    it('after arrival: Mark Resolved (with its confirmation)', () => {
      const [resolve] = nextAssignmentActions('ACCEPTED', 'TRANSPORTING', { open: false });
      expect(resolve).toMatchObject({ kind: 'status', status: 'RESOLVED' });
      expect(resolve.kind === 'status' && resolve.confirm).toBeTruthy();
    });

    it('no transport record (null): Mark Resolved; the server decides', () => {
      expect(labelsOf(nextAssignmentActions('ACCEPTED', 'TRANSPORTING', null))).toEqual(['Mark Resolved']);
    });

    it('transports not loaded yet (undefined): nothing, so Mark Resolved never flashes before arrival', () => {
      expect(nextAssignmentActions('ACCEPTED', 'TRANSPORTING')).toEqual([]);
    });

    it('uses the translated label', () => {
      expect(labelsOf(nextAssignmentActions('ACCEPTED', 'TRANSPORTING', { open: true }, fil.transport))).toEqual([
        'Nakarating sa ospital',
      ]);
    });
  });

  it('nothing once the incident is finished or the dispatch is not accepted', () => {
    expect(nextAssignmentActions('ACCEPTED', 'RESOLVED')).toEqual([]);
    expect(nextAssignmentActions('COMPLETED', 'CLOSED')).toEqual([]);
  });
});

describe('isTransportOpenError', () => {
  it('recognises the 409 TRANSPORT_OPEN refusal of Mark Resolved', () => {
    const err = new ApiError('Record arrival at the hospital before resolving.', 409, {
      code: 'TRANSPORT_OPEN', transportId: 'tr-1', message: 'Record arrival at the hospital before resolving.',
    });
    expect(isTransportOpenError(err)).toBe(true);
  });

  it.each([
    ['another 409', new ApiError('x', 409, { code: 'TRANSPORT_ARRIVED' })],
    ['a 400', new ApiError('x', 400, { code: 'TRANSPORT_OPEN' })],
    ['a plain error', new Error('x')],
    ['nothing', undefined],
  ])('ignores %s', (_label, err) => {
    expect(isTransportOpenError(err)).toBe(false);
  });
});

describe('shouldShareLocation', () => {
  it('shares while accepted and the incident is not finished', () => {
    expect(shouldShareLocation('ACCEPTED', 'TRANSPORTING')).toBe(true);
    expect(shouldShareLocation('ACCEPTED', 'RESOLVED')).toBe(false);
    expect(shouldShareLocation('SENT', 'DISPATCHED')).toBe(false);
  });
});
