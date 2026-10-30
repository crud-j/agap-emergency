import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** PATCH /hospitals/:id/active: deactivate or reactivate a hospital (MOD-39, plan §9.4). */
export class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
