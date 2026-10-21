import {
  AccountSnapshot,
  DeviceSnapshot,
  evaluateAccountChecks,
  evaluateDeviceChecks,
  overallStatus,
  sortChecks,
} from '../../src/users/readiness/readiness.evaluator';

const readyDevice: DeviceSnapshot = {
  locationPermission: 'GRANTED',
  locationServicesEnabled: true,
  notificationPermission: 'GRANTED',
  cameraPermission: 'GRANTED',
  motionSensorAvailable: true,
  connectivity: 'ONLINE',
};

const readyAccount: AccountSnapshot = {
  pushTokenRegistered: true,
  activeEmergencyContacts: 1,
  phoneNumber: '+639171234567',
  phoneVerified: true,
  hasMedicalProfile: true,
  medicalConsentGranted: true,
};

function evaluate(device: Partial<DeviceSnapshot> = {}, account: Partial<AccountSnapshot> = {}) {
  const fullAccount = { ...readyAccount, ...account };
  const checks = [
    ...evaluateDeviceChecks({ ...readyDevice, ...device }, fullAccount),
    ...evaluateAccountChecks(fullAccount),
  ];
  return { checks, status: overallStatus(checks), byId: Object.fromEntries(checks.map((c) => [c.id, c])) };
}

describe('MOD-05 readiness evaluator', () => {
  it('is READY when every essential and recommended check passes', () => {
    expect(evaluate().status).toBe('READY');
  });

  it('is NOT_READY when location permission is denied', () => {
    const result = evaluate({ locationPermission: 'DENIED' });
    expect(result.status).toBe('NOT_READY');
    expect(result.byId.location).toMatchObject({ status: 'ACTION_NEEDED', reason: 'PERMISSION_DENIED' });
  });

  it('flags location services switched off even when permission is granted', () => {
    expect(evaluate({ locationServicesEnabled: false }).byId.location.reason).toBe('SERVICES_OFF');
  });

  it('is NOT_READY when offline and LIMITED on a limited connection', () => {
    expect(evaluate({ connectivity: 'OFFLINE' }).status).toBe('NOT_READY');
    expect(evaluate({ connectivity: 'LIMITED' }).status).toBe('LIMITED');
  });

  it('marks notifications LIMITED when permission is granted but no push token is registered', () => {
    const result = evaluate({}, { pushTokenRegistered: false });
    expect(result.byId.notifications).toMatchObject({ status: 'LIMITED', reason: 'NOT_REGISTERED' });
    expect(result.status).toBe('LIMITED');
  });

  it('does not require server data for the device-only evaluation', () => {
    const checks = evaluateDeviceChecks(readyDevice);
    expect(checks.find((c) => c.id === 'notifications')?.status).toBe('READY');
  });

  it('is LIMITED when recommended account items are missing', () => {
    expect(evaluate({}, { activeEmergencyContacts: 0 }).status).toBe('LIMITED');
    expect(evaluate({}, { phoneNumber: null }).byId.phone_number.reason).toBe('MISSING');
    expect(evaluate({}, { phoneVerified: false }).byId.phone_number.status).toBe('LIMITED');
  });

  it('never lowers the overall status for optional items', () => {
    const result = evaluate(
      { cameraPermission: 'DENIED', motionSensorAvailable: false },
      { medicalConsentGranted: false, hasMedicalProfile: false },
    );
    expect(result.status).toBe('READY');
    expect(result.byId.medical_profile.reason).toBe('NO_CONSENT');
  });

  it('orders checks essential, then recommended, then optional', () => {
    const tiers = sortChecks(evaluate().checks).map((c) => c.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) =>
      ['ESSENTIAL', 'RECOMMENDED', 'OPTIONAL'].indexOf(a) - ['ESSENTIAL', 'RECOMMENDED', 'OPTIONAL'].indexOf(b)));
    expect(tiers[0]).toBe('ESSENTIAL');
    expect(tiers[tiers.length - 1]).toBe('OPTIONAL');
  });
});
