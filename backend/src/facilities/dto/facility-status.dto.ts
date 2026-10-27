import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const RECEIVING_STATUSES = ['OPEN', 'AT_CAPACITY', 'CLOSED', 'EMERGENCY_ONLY', 'UNKNOWN'] as const;

export class FacilityStatusDto {
  @ApiPropertyOptional({ enum: RECEIVING_STATUSES })
  @IsOptional()
  @IsIn(RECEIVING_STATUSES)
  receivingStatus?: (typeof RECEIVING_STATUSES)[number];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  capacityAvailable?: number;
}

export const FACILITY_TYPES = ['HOSPITAL', 'EVACUATION_CENTER', 'BARANGAY_HALL', 'RELIEF_CENTER', 'CLINIC', 'OTHER'] as const;

export class CreateFacilityDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: FACILITY_TYPES })
  @IsIn(FACILITY_TYPES)
  facilityType!: (typeof FACILITY_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barangay?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  municipality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEvacuationCenter?: boolean;
}
