import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ParseUUIDPipe } from '@nestjs/common';
import { StartTransportDto } from '../../src/incidents/transport/dto/start-transport.dto';
import { UpdateTransportDto } from '../../src/incidents/transport/dto/update-transport.dto';
import { RecordArrivalDto } from '../../src/incidents/transport/dto/record-arrival.dto';
import { CreateReferralDto } from '../../src/hospitals/dto/create-referral.dto';
import { CreateHospitalDto } from '../../src/hospitals/dto/create-hospital.dto';

// Fixed seed ids have version digit 0 (not RFC 4122). Path ids already accept them
// (ParseUUIDPipe); body ids must too, or a responder can open a seeded incident but
// not start its transport to a seeded hospital.
const SEED_HOSPITAL = '00000000-0000-0000-0002-000000000006';
const SEED_DISPATCH = '00000000-0000-0000-0007-000000000001';
const RANDOM_V4 = '3f1c2a9e-5b7d-4c1e-9a2b-8d6f0e4c1a77';

async function errorsFor(cls: new () => object, body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('record ids in request bodies (seed ids)', () => {
  it('path ids: ParseUUIDPipe accepts the seed format (the rule bodies now match)', async () => {
    await expect(new ParseUUIDPipe().transform(SEED_HOSPITAL, { type: 'param' })).resolves.toBe(SEED_HOSPITAL);
  });

  it.each([SEED_HOSPITAL, RANDOM_V4])('transport start/update/arrival accept %s', async (id) => {
    expect(await errorsFor(StartTransportDto, { dispatchId: SEED_DISPATCH, destinationId: id })).toEqual([]);
    expect(await errorsFor(UpdateTransportDto, { destinationId: id })).toEqual([]);
    expect(await errorsFor(RecordArrivalDto, { destinationId: id })).toEqual([]);
  });

  it('referral and hospital create accept seeded dispatch / organization ids', async () => {
    expect(await errorsFor(CreateReferralDto, { incidentId: SEED_DISPATCH, dispatchId: SEED_DISPATCH })).toEqual([]);
    expect(await errorsFor(CreateHospitalDto, { name: 'Test Hospital', organizationId: SEED_HOSPITAL })).toEqual([]);
  });

  it.each(['not-an-id', '00000000-0000-0000-0002-00000000000', "1' OR '1'='1", ''])(
    'still rejects %p',
    async (id) => {
      expect(await errorsFor(StartTransportDto, { dispatchId: id })).toContain('dispatchId must be a UUID');
    },
  );
});
