import 'reflect-metadata';
import { UserRole } from '@agap/shared';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { IncidentsController } from '../../src/incidents/incidents.controller';
import { FalseAlertsController } from '../../src/false-alerts/false-alerts.controller';
import { EscalationsController } from '../../src/escalations/escalations.controller';
import { DisasterModeController } from '../../src/disaster-mode/disaster-mode.controller';

const { DISPATCHER, SUPERVISOR, SYSTEM_ADMINISTRATOR, ORG_ADMINISTRATOR, CITIZEN, BYSTANDER } = UserRole;

function rolesOf(controller: { prototype: object }, method: string): UserRole[] {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  expect(handler).toBeInstanceOf(Function);
  return Reflect.getMetadata(ROLES_KEY, handler as object) ?? [];
}

/**
 * Role dashboards plan, Phase 5b: the System Administrator (and, where listed, the
 * Org Administrator) has no operational authority. Dispatcher and Supervisor
 * permissions never shrink.
 */
describe('Separation of duties (Phase 5b)', () => {
  it.each<[string, { prototype: object }, string, UserRole[]]>([
    ['PATCH /incidents/:id/status', IncidentsController, 'updateStatus', [DISPATCHER, SUPERVISOR]],
    ['PATCH /false-alerts/:id/cancel', FalseAlertsController, 'cancel', [CITIZEN, BYSTANDER, DISPATCHER, SUPERVISOR]],
    ['PATCH /false-alerts/:id/false-alert', FalseAlertsController, 'markFalseAlert', [DISPATCHER, SUPERVISOR]],
    ['GET /escalations', EscalationsController, 'findAll', [SUPERVISOR]],
    ['GET /escalations/:id', EscalationsController, 'findById', [SUPERVISOR]],
    ['POST /escalations/:id/acknowledge', EscalationsController, 'acknowledge', [SUPERVISOR]],
    ['POST /escalations/:id/resolve', EscalationsController, 'resolve', [SUPERVISOR]],
    ['POST /disaster-mode/activate', DisasterModeController, 'activate', [SUPERVISOR]],
    ['POST /disaster-mode/deactivate', DisasterModeController, 'deactivate', [SUPERVISOR]],
    ['POST /disaster-mode/broadcast', DisasterModeController, 'broadcast', [SUPERVISOR]],
  ])('%s allows exactly the operational roles', (_route, controller, method, expected) => {
    const roles = rolesOf(controller, method);
    expect([...roles].sort()).toEqual([...expected].sort());
    expect(roles).not.toContain(SYSTEM_ADMINISTRATOR);
    expect(roles).not.toContain(ORG_ADMINISTRATOR);
  });

  it('keeps read-only visibility for the System Administrator (decision D1)', () => {
    expect(rolesOf(IncidentsController, 'findAll')).toContain(SYSTEM_ADMINISTRATOR);
    expect(rolesOf(DisasterModeController, 'status')).toContain(SYSTEM_ADMINISTRATOR);
  });
});
