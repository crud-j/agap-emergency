import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { resource_status } from '@prisma/client';
import {
  DEPLOYED_RESOURCE_STATUSES,
  ResourceStatus,
  UNAVAILABLE_RESOURCE_STATUSES,
} from '@agap/shared';
import { UpdateResourceStatusDto } from '../../src/resources/dto/update-resource-status.dto';

// MOD-28 [new MOD-27]: the Fleet board offered MAINTENANCE, which the database enum
// doesn't have, and the change failed with "Invalid query parameters".

describe('Unit status values', () => {
  it('the shared ResourceStatus list is exactly the database enum', () => {
    expect(Object.values(ResourceStatus).sort()).toEqual(Object.values(resource_status).sort());
  });

  it('deployed and unavailable never overlap, and AVAILABLE is in neither', () => {
    const overlap = DEPLOYED_RESOURCE_STATUSES.filter((s) => UNAVAILABLE_RESOURCE_STATUSES.includes(s));
    expect(overlap).toEqual([]);
    expect([...DEPLOYED_RESOURCE_STATUSES, ...UNAVAILABLE_RESOURCE_STATUSES]).not.toContain(ResourceStatus.AVAILABLE);
  });

  it('PATCH /resources/:id/status accepts every database status', async () => {
    for (const status of Object.values(resource_status)) {
      expect(await validate(plainToInstance(UpdateResourceStatusDto, { status }))).toHaveLength(0);
    }
  });

  it('refuses a status the database does not have, before it reaches Prisma', async () => {
    const errors = await validate(plainToInstance(UpdateResourceStatusDto, { status: 'MAINTENANCE' }));
    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0]!.constraints ?? {}).join(' ')).toMatch('OUT_OF_SERVICE');
  });
});
