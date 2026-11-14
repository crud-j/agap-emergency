import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

const MIN_SECS = 30;
const MAX_SECS = 24 * 60 * 60;

/**
 * New targets for one SLA policy, in seconds from the report. The service also checks
 * acknowledge ≤ dispatch ≤ on scene.
 */
export class UpdateSlaPolicyDto {
  @ApiProperty({ example: 60, description: 'Seconds from the report to acknowledgement' })
  @IsInt()
  @Min(MIN_SECS, { message: `acknowledgeSecs must be at least ${MIN_SECS} seconds.` })
  @Max(MAX_SECS, { message: 'acknowledgeSecs must be at most 24 hours.' })
  acknowledgeSecs!: number;

  @ApiProperty({ example: 120, description: 'Seconds from the report to dispatch' })
  @IsInt()
  @Min(MIN_SECS, { message: `dispatchSecs must be at least ${MIN_SECS} seconds.` })
  @Max(MAX_SECS, { message: 'dispatchSecs must be at most 24 hours.' })
  dispatchSecs!: number;

  @ApiProperty({ example: 600, description: 'Seconds from the report to the first unit on scene' })
  @IsInt()
  @Min(MIN_SECS, { message: `onSceneSecs must be at least ${MIN_SECS} seconds.` })
  @Max(MAX_SECS, { message: 'onSceneSecs must be at most 24 hours.' })
  onSceneSecs!: number;
}
