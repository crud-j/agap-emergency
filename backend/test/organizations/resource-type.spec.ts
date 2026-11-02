import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { resource_type } from '@prisma/client';
import { ResourceType } from '@agap/shared';
import { CreateResourceDto } from '../../src/resources/dto/create-resource.dto';
import { UpdateResourceDto } from '../../src/resources/dto/update-resource.dto';

// MOD-27: the Registry offered types the database enum doesn't have (RESCUE_VEHICLE,
// PERSONNEL, ...) and sent a plate number as vehicleId, so "Add resource" failed in Prisma.

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function createErrors(body: Record<string, unknown>) {
  return validate(plainToInstance(CreateResourceDto, { organizationId: ORG_ID, name: 'Ambulance 3', ...body }));
}

describe('Unit type values', () => {
  it('the shared ResourceType list is exactly the database enum', () => {
    expect(Object.values(ResourceType).sort()).toEqual(Object.values(resource_type).sort());
  });

  it('POST /resources accepts every database type', async () => {
    for (const type of Object.values(resource_type)) {
      expect(await createErrors({ resourceType: type })).toHaveLength(0);
    }
  });

  it('refuses a type the database does not have, before it reaches Prisma', async () => {
    const errors = await createErrors({ resourceType: 'RESCUE_VEHICLE' });
    expect(errors.map((e) => e.property)).toEqual(['resourceType']);
    expect(Object.values(errors[0]!.constraints ?? {}).join(' ')).toMatch('RESCUE_TRUCK');
  });

  it('refuses a plate number as vehicleId (it is a vehicles.id)', async () => {
    const errors = await createErrors({ resourceType: 'AMBULANCE', vehicleId: 'ABC 1234' });
    expect(errors.map((e) => e.property)).toEqual(['vehicleId']);
  });

  it('PATCH /resources/:id takes a partial body and still checks the type', async () => {
    expect(await validate(plainToInstance(UpdateResourceDto, { callSign: '' }))).toHaveLength(0);
    const errors = await validate(plainToInstance(UpdateResourceDto, { resourceType: 'PERSONNEL' }));
    expect(errors.map((e) => e.property)).toEqual(['resourceType']);
  });
});
