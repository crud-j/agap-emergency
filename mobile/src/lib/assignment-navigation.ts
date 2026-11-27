/** The screen of one assignment (dispatch), with Accept / Decline. */
export function assignmentPath(dispatchId: string): string {
  return `/responder/assignment/${dispatchId}`;
}

/** Tag of the assignment's notification in the shade (backend assignmentTag). */
export function assignmentNotificationTag(dispatchId: string): string {
  return `assignment-${dispatchId}`;
}

/**
 * Open an assignment from the alarm, a tapped push or anywhere else, the same way every
 * time: nothing happens if it is already on screen, so repeated taps never stack copies
 * of the same screen. Back from it returns to where the responder was (or Home).
 */
export function openAssignment(
  router: { push: (href: never) => void },
  currentPath: string,
  dispatchId: string,
): boolean {
  const target = assignmentPath(dispatchId);
  if (currentPath === target) return false;
  router.push(target as never);
  return true;
}
