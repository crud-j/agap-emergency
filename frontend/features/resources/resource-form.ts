import type { CreateResourceBody, Resource } from './api';

/** The Registry's Add / Edit resource form. */
export interface ResourceFormState {
  organizationId: string;
  name: string;
  callSign: string;
  resourceType: string;
}

export type ResourceFormErrors = Partial<Record<'organizationId' | 'name' | 'resourceType', string>>;

/**
 * The form's starting values. Editing starts from the unit; adding starts empty, owned
 * by the given organization (the Org Administrator's own).
 */
export function resourceFormFor(editing: Resource | null, defaultOrgId?: string): ResourceFormState {
  if (editing) {
    return {
      organizationId: editing.organization_id,
      name: editing.name,
      callSign: editing.call_sign ?? '',
      resourceType: editing.resource_type,
    };
  }
  return { organizationId: defaultOrgId ?? '', name: '', callSign: '', resourceType: '' };
}

/** One message per missing required field, shown under that field. */
export function validateResourceForm(form: ResourceFormState): ResourceFormErrors {
  const errors: ResourceFormErrors = {};
  if (!form.organizationId) errors.organizationId = 'Choose the organization that owns this unit.';
  if (!form.name.trim())    errors.name = 'Enter a name, for example "Ambulance 3".';
  if (!form.resourceType)   errors.resourceType = 'Choose what kind of unit this is.';
  return errors;
}

/** POST /resources. Call signs are stored in capitals, as radio traffic writes them. */
export function resourceCreateBody(form: ResourceFormState): CreateResourceBody {
  const callSign = form.callSign.trim().toUpperCase();
  return {
    organizationId: form.organizationId,
    name: form.name.trim(),
    resourceType: form.resourceType,
    ...(callSign && { callSign }),
  };
}

/**
 * PATCH /resources/:id. No organization (a unit can't move organizations), and the call
 * sign is always sent, so clearing the field clears it.
 */
export function resourceUpdateBody(form: ResourceFormState): Partial<CreateResourceBody> {
  return {
    name: form.name.trim(),
    resourceType: form.resourceType,
    callSign: form.callSign.trim().toUpperCase(),
  };
}
