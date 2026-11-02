import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** MOD-29 — a Supervisor or System Administrator confirms (or withdraws) a unit's capability. */
export class VerifyCapabilityDto {
  @ApiProperty()
  @IsBoolean()
  verified!: boolean;
}
