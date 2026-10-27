import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum } from 'class-validator';
import { UserRole } from '@agap/shared';

export class ChangeRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}

export class ConfigValueDto {
  @ApiProperty({ description: 'Any JSON value' })
  @IsDefined()
  value!: unknown;
}
