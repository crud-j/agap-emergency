import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ResourceType } from '@agap/shared';

export class CreateResourceDto {
  @ApiProperty()
  @IsString()
  organizationId!: string;

  @ApiProperty({ example: 'Ambulance 1' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'ALPHA-1' })
  @IsOptional()
  @IsString()
  callSign?: string;

  // An unknown type (the Registry once offered RESCUE_VEHICLE) is a 400 naming the
  // allowed ones, not a Prisma error from the database enum.
  @ApiProperty({ enum: ResourceType, example: ResourceType.AMBULANCE })
  @IsEnum(ResourceType)
  resourceType!: ResourceType;

  // vehicles.id, not a plate number: the column is a foreign key.
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
