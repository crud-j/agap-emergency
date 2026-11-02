import { ResourceType } from '@agap/shared';
import type { Resource } from '@/features/resources/api';
import {
  resourceCreateBody,
  resourceFormFor,
  resourceUpdateBody,
  validateResourceForm,
} from '@/features/resources/resource-form';
import { RESOURCE_TYPES, resourceTypeHint, resourceTypeLabel } from '@/features/resources/resource-type';

const UNIT: Resource = {
  id: 'r1',
  name: 'BFP Rescue Truck 1',
  call_sign: 'CHARLIE-2',
  resource_type: 'RESCUE_TRUCK',
  status: 'AVAILABLE',
  base_barangay: 'Poblacion',
  base_lat: null,
  base_lng: null,
  organization_id: 'org-bfp',
};

describe('Registry form starting values (MOD-27)', () => {
  it('Edit starts from the unit, so its organization is set and Save can pass validation', () => {
    const form = resourceFormFor(UNIT, 'org-mdrrmo');
    expect(form).toEqual({
      organizationId: 'org-bfp',
      name: 'BFP Rescue Truck 1',
      callSign: 'CHARLIE-2',
      resourceType: 'RESCUE_TRUCK',
    });
    expect(validateResourceForm(form)).toEqual({});
  });

  it('Add starts empty, owned by the default organization', () => {
    expect(resourceFormFor(null, 'org-mdrrmo')).toEqual({
      organizationId: 'org-mdrrmo', name: '', callSign: '', resourceType: '',
    });
  });

  it('names each missing required field', () => {
    expect(Object.keys(validateResourceForm(resourceFormFor(null)))).toEqual(['organizationId', 'name', 'resourceType']);
  });
});

describe('Registry request bodies (MOD-27)', () => {
  const form = { organizationId: 'org-bfp', name: '  Ambulance 3 ', callSign: ' alpha-3 ', resourceType: 'AMBULANCE' };

  it('Add sends the organization and a capitalised call sign, and never a vehicle id', () => {
    expect(resourceCreateBody(form)).toEqual({
      organizationId: 'org-bfp', name: 'Ambulance 3', resourceType: 'AMBULANCE', callSign: 'ALPHA-3',
    });
    expect(resourceCreateBody({ ...form, callSign: '' })).not.toHaveProperty('callSign');
  });

  it('Edit leaves the organization out and sends an empty call sign so it can be cleared', () => {
    const body = resourceUpdateBody({ ...form, callSign: '' });
    expect(body).not.toHaveProperty('organizationId');
    expect(body).toEqual({ name: 'Ambulance 3', resourceType: 'AMBULANCE', callSign: '' });
  });
});

describe('Unit types offered by the Registry (MOD-27)', () => {
  it('are exactly the shared ResourceType values (the database enum)', () => {
    expect([...RESOURCE_TYPES].sort()).toEqual(Object.values(ResourceType).sort());
    expect(RESOURCE_TYPES).not.toContain('RESCUE_VEHICLE');
  });

  it('each has a label and a hint', () => {
    for (const type of RESOURCE_TYPES) {
      expect(resourceTypeLabel(type)).not.toBe('');
      expect(resourceTypeHint(type)).not.toBe('');
    }
    expect(resourceTypeLabel('RESCUE_TRUCK')).toBe('Rescue truck');
  });
});
