/// <reference types="jest" />

import { assignmentNotificationTag, assignmentPath, openAssignment } from '../assignment-navigation';

describe('opening an assignment (MOD-32 navigation)', () => {
  it('pushes the assignment screen from anywhere else', () => {
    const router = { push: jest.fn() };
    expect(openAssignment(router, '/responder/home', 'disp-1')).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/responder/assignment/disp-1');
  });

  it('does nothing when that assignment is already on screen (no stacked copies)', () => {
    const router = { push: jest.fn() };
    expect(openAssignment(router, '/responder/assignment/disp-1', 'disp-1')).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('opens a different assignment from an assignment screen', () => {
    const router = { push: jest.fn() };
    expect(openAssignment(router, '/responder/assignment/disp-1', 'disp-2')).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/responder/assignment/disp-2');
  });

  it('path and tag match the backend (assignmentTag) and the deep link', () => {
    expect(assignmentPath('d')).toBe('/responder/assignment/d');
    expect(assignmentNotificationTag('d')).toBe('assignment-d');
  });
});
