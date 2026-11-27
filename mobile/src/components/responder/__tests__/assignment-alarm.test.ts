/// <reference types="jest" />

import { ALARM_PATTERN, alarmOffer } from '../assignment-alarm';

describe('in-app assignment alarm (MOD-32)', () => {
  const offers = [{ id: 'disp-1' }, { id: 'disp-2' }];

  it('rings for the first unanswered offer anywhere in the app', () => {
    expect(alarmOffer(offers, '/responder/home')).toEqual({ id: 'disp-1' });
    expect(alarmOffer(offers, '/profile/passkeys')).toEqual({ id: 'disp-1' });
  });

  it('stops on that assignment\'s own screen, where Accept and Decline are', () => {
    expect(alarmOffer(offers, '/responder/assignment/disp-1')).toBeNull();
  });

  it('does not pull the responder off one waiting offer to another', () => {
    expect(alarmOffer(offers, '/responder/assignment/disp-2')).toBeNull();
  });

  it('still rings over an accepted mission\'s screen when a new offer arrives', () => {
    expect(alarmOffer(offers, '/responder/assignment/disp-9')).toEqual({ id: 'disp-1' });
  });

  it('nothing waiting → nothing rings', () => {
    expect(alarmOffer([], '/responder/home')).toBeNull();
  });

  it('vibrates 1 s on, 0.6 s off', () => {
    expect(ALARM_PATTERN).toEqual([0, 1000, 600]);
  });
});
