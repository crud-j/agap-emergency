/// <reference types="jest" />
import { en, fil } from '@/src/i18n/translations';
import { ApiError } from '@/src/services/api/http';
import { fieldFlowFor } from '@agap/shared';
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
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'ASSISTING'))).toEqual(['Mark Resolved', 'Transporting']);
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

  it('uses this dispatch progress before the incident status for a second unit', () => {
    expect(labelsOf(nextAssignmentActions(
      'ACCEPTED',
      'ON_SCENE',
      null,
      undefined,
      { enRouteAt: '2026-10-31T00:00:00Z' },
    ))).toEqual(['Mark On Scene']);
    expect(labelsOf(nextAssignmentActions(
      'ACCEPTED',
      'TRANSPORTING',
      { open: false },
      undefined,
      { onSceneAt: '2026-10-31T00:10:00Z', otherUnitsActive: true },
    ))).toEqual(['Finish (your unit)']);
  });

  it('offers the fire report form and Finish (never Transporting) to a fire unit at the scene', () => {
    const actions = nextAssignmentActions('ACCEPTED', 'ON_SCENE', null, undefined, undefined, 'FIRE');
    expect(labelsOf(actions)).toEqual(['Fire Report', 'Mark Resolved']);
    expect(actions.map((a) => a.kind)).toEqual(['fireReport', 'status']);
  });

  it('offers the rescue trip form and Finish (never Transporting) to a rescue unit at the scene', () => {
    const actions = nextAssignmentActions('ACCEPTED', 'ON_SCENE', null, undefined, undefined, 'RESCUE');
    expect(labelsOf(actions)).toEqual(['Record Rescue Trip', 'Mark Resolved']);
    expect(actions.map((a) => a.kind)).toEqual(['rescueTrip', 'status']);
  });

  it('offers Treating on Scene and Finish, no transport, to a first-aid unit', () => {
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'ON_SCENE', null, undefined, undefined, 'MEDICAL_FIRST')))
      .toEqual(['Treating on Scene', 'Mark Resolved']);
  });

  it('follows the incident past the scene: an ambulance that started transport sees arrival, not Transporting again', () => {
    const progress = { enRouteAt: '2026-10-31T00:00:00Z', onSceneAt: '2026-10-31T00:10:00Z' };
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'TRANSPORTING', { open: true }, undefined, progress)))
      .toEqual([en.transport.arrivedAction]);
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'TRANSPORTING', { open: false }, undefined, progress)))
      .toEqual(['Mark Resolved']);
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'RESOLVED', null, undefined, progress))).toEqual([]);
  });

  it('lets an ambulance that treated on scene still start a transport', () => {
    const progress = { onSceneAt: '2026-10-31T00:10:00Z' };
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'ASSISTING', null, undefined, progress)))
      .toEqual(['Mark Resolved', 'Transporting']);
    // A fire unit never gets Transporting; it keeps its own tools (see the next test).
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'ASSISTING', null, undefined, progress, 'FIRE')))
      .toEqual(['Fire Report', 'Mark Resolved']);
  });

  it('a fire or rescue crew keeps its report and Finish while another unit transports or treats', () => {
    const progress = { enRouteAt: '2026-10-31T00:00:00Z', onSceneAt: '2026-10-31T00:10:00Z', otherUnitsActive: true };
    for (const incidentStatus of ['TRANSPORTING', 'ASSISTING']) {
      // transport undefined (not loaded) or null (the fire unit has none) must not hide them.
      for (const transport of [undefined, null]) {
        const fire = nextAssignmentActions('ACCEPTED', incidentStatus, transport, undefined, progress, 'FIRE');
        expect(fire.map((a) => a.kind)).toEqual(['fireReport', 'status']);
        expect(labelsOf(fire)).toEqual(['Fire Report', 'Finish (your unit)']);
        expect(labelsOf(nextAssignmentActions('ACCEPTED', incidentStatus, transport, undefined, progress, 'RESCUE')))
          .toEqual(['Record Rescue Trip', 'Finish (your unit)']);
      }
    }
  });

  it('a second unit that has not left yet sees Mark En Route, even though the incident is on scene', () => {
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'ON_SCENE', null, undefined, { otherUnitsActive: true })))
      .toEqual(['Mark En Route']);
    // Alone on the incident with no stamps (a dispatch from before the stamps): follow the incident.
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'ON_SCENE', null, undefined, {})))
      .toEqual(['Transporting', 'Treating on Scene']);
  });

  it('Finish (your unit) explains that the incident stays open', () => {
    const finish = nextAssignmentActions('ACCEPTED', 'ASSISTING', null, undefined,
      { onSceneAt: '2026-10-31T00:10:00Z', otherUnitsActive: true }, 'FIRE').find((a) => a.kind === 'status');
    expect(finish).toMatchObject({ label: 'Finish (your unit)', status: 'RESOLVED' });
    expect(finish?.kind === 'status' && finish.confirm?.message).toContain('stays open');
  });

  it('does not offer medical transport or treating actions to a general unit', () => {
    expect(labelsOf(nextAssignmentActions('ACCEPTED', 'ON_SCENE', null, undefined, undefined, 'GENERAL')))
      .toEqual(['Mark Resolved']);
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

  describe('fieldFlowFor', () => {
    it.each([
      ['AMBULANCE', 'MEDICAL_TRANSPORT'],
      ['MOTORCYCLE_RESPONDER', 'MEDICAL_FIRST'],
      ['FIRE_TRUCK', 'FIRE'],
      ['RESCUE_BOAT', 'RESCUE'],
      ['RESCUE_TRUCK', 'RESCUE'],
      ['CLEARING_EQUIPMENT', 'GENERAL'],
      ['COMMAND_VEHICLE', 'GENERAL'],
      ['OTHER', 'GENERAL'],
    ])('%s maps to %s', (resourceType, flow) => {
      expect(fieldFlowFor(resourceType)).toBe(flow);
    });

    it('maps unknown resource types to GENERAL', () => {
      expect(fieldFlowFor('FUTURE_UNIT')).toBe('GENERAL');
    });
  });
});
