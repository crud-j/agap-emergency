import { Prisma } from '@prisma/client';
import { TransportLegService } from '../../src/incidents/transport/transport-leg.service';

const dec = (n: number) => new Prisma.Decimal(n);

const verifiedHospital = {
  name: 'DOH — Joni Villanueva General Hospital',
  latitude: dec(14.79679),
  longitude: dec(120.94358),
  location_status: 'VERIFIED',
};

function dispatchRow(opts: {
  status?: string;
  scene?: { latitude: Prisma.Decimal; longitude: Prisma.Decimal } | null;
  latest?: { id: string; arrived_at: Date | null; facilities: unknown } | null;
} = {}) {
  return {
    incident_id: 'inc-1',
    incidents: {
      status: opts.status ?? 'EN_ROUTE',
      incident_locations: opts.scene === undefined ? { latitude: dec(14.8), longitude: dec(120.93) } : opts.scene,
    },
    transport_records: opts.latest ? [opts.latest] : [],
  };
}

function setup(open: unknown, dispatch: unknown) {
  const prisma = {
    transportRecord: { findFirst: jest.fn().mockResolvedValue(open) },
    dispatches: { findUnique: jest.fn().mockResolvedValue(dispatch) },
  };
  return { service: new TransportLegService(prisma as any), prisma };
}

describe('TransportLegService.resolve (plan §12 Leg)', () => {
  it('uses the one open-transport definition (C16) for this dispatch', async () => {
    const { service, prisma } = setup(null, dispatchRow());
    await service.resolve('dispatch-1');
    expect(prisma.transportRecord.findFirst.mock.calls[0][0].where).toEqual({
      dispatch_id: 'dispatch-1',
      arrived_at: null,
      incidents: { status: 'TRANSPORTING' },
    });
  });

  it('open transport to a hospital with coordinates → TO_FACILITY with numeric target', async () => {
    const { service } = setup(
      { id: 'tr-1', facilities: verifiedHospital },
      dispatchRow({ status: 'TRANSPORTING', latest: { id: 'tr-1', arrived_at: null, facilities: verifiedHospital } }),
    );

    await expect(service.resolve('dispatch-1')).resolves.toEqual({
      leg: 'TO_FACILITY',
      target: { lat: 14.79679, lng: 120.94358 },
      destination: {
        kind: 'FACILITY',
        name: 'DOH — Joni Villanueva General Hospital',
        latitude: 14.79679,
        longitude: 120.94358,
        locationVerified: true,
      },
      transportId: 'tr-1',
      incidentId: 'inc-1',
    });
  });

  it('unverified hospital with coordinates → still routed, locationVerified false', async () => {
    const unverified = { ...verifiedHospital, location_status: 'UNVERIFIED' };
    const { service } = setup({ id: 'tr-1', facilities: unverified }, dispatchRow({ status: 'TRANSPORTING' }));

    const leg = await service.resolve('dispatch-1');

    expect(leg?.target).toEqual({ lat: 14.79679, lng: 120.94358 });
    expect(leg?.destination?.locationVerified).toBe(false);
  });

  it('open transport, hospital without coordinates → TO_FACILITY, target null', async () => {
    const noCoords = { name: 'Bocaue General Hospital', latitude: null, longitude: null, location_status: 'UNVERIFIED' };
    const { service } = setup({ id: 'tr-1', facilities: noCoords }, dispatchRow({ status: 'TRANSPORTING' }));

    await expect(service.resolve('dispatch-1')).resolves.toEqual({
      leg: 'TO_FACILITY',
      target: null,
      destination: { kind: 'FACILITY', name: 'Bocaue General Hospital', latitude: null, longitude: null, locationVerified: false },
      transportId: 'tr-1',
      incidentId: 'inc-1',
    });
  });

  it('open transport with no destination yet ("Decide later") → TO_FACILITY, target and destination null', async () => {
    const { service } = setup({ id: 'tr-1', facilities: null }, dispatchRow({ status: 'TRANSPORTING' }));

    const leg = await service.resolve('dispatch-1');

    expect(leg).toMatchObject({ leg: 'TO_FACILITY', target: null, destination: null, transportId: 'tr-1' });
  });

  it('latest transport arrived, incident still TRANSPORTING → AT_FACILITY, target null', async () => {
    const { service } = setup(
      null,
      dispatchRow({
        status: 'TRANSPORTING',
        latest: { id: 'tr-1', arrived_at: new Date(), facilities: verifiedHospital },
      }),
    );

    const leg = await service.resolve('dispatch-1');

    expect(leg).toMatchObject({ leg: 'AT_FACILITY', target: null, transportId: 'tr-1', incidentId: 'inc-1' });
    expect(leg?.destination?.name).toBe('DOH — Joni Villanueva General Hospital');
  });

  it.each(['RESOLVED', 'CLOSED'])('arrived transport on a %s incident → TO_SCENE', async (status) => {
    const { service } = setup(
      null,
      dispatchRow({ status, latest: { id: 'tr-1', arrived_at: new Date(), facilities: verifiedHospital } }),
    );
    await expect(service.resolve('dispatch-1')).resolves.toMatchObject({ leg: 'TO_SCENE', transportId: null });
  });

  it('no transport → TO_SCENE, target = incident location as numbers', async () => {
    const { service } = setup(null, dispatchRow());

    await expect(service.resolve('dispatch-1')).resolves.toEqual({
      leg: 'TO_SCENE',
      target: { lat: 14.8, lng: 120.93 },
      destination: null,
      transportId: null,
      incidentId: 'inc-1',
    });
  });

  it('no transport and no incident location → TO_SCENE, target null', async () => {
    const { service } = setup(null, dispatchRow({ scene: null }));
    await expect(service.resolve('dispatch-1')).resolves.toMatchObject({ leg: 'TO_SCENE', target: null });
  });

  it('unknown dispatch → null', async () => {
    const { service } = setup(null, null);
    await expect(service.resolve('missing')).resolves.toBeNull();
  });
});
