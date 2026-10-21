import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetBarangayDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  barangayId!: string;
}
