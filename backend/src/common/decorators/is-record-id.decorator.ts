import { IsUUID, type ValidationOptions } from 'class-validator';

/**
 * A database record id in a request body: any 8-4-4-4-12 hex id Postgres stores
 * as `uuid`. The same rule as ParseUUIDPipe for path ids.
 *
 * Plain @IsUUID() only accepts RFC versions 1–8, so it rejects the fixed seed ids
 * (`00000000-0000-0000-0002-000000000006`, version digit 0) that path ids accept:
 * a responder could open a seeded incident but not start its transport.
 */
export const IsRecordId = (validationOptions?: ValidationOptions): PropertyDecorator =>
  IsUUID('loose', validationOptions);
