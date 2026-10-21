import { IsString, MinLength } from 'class-validator';

export class AdminUserActionDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
