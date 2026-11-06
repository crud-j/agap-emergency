import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** POST /auth/id-verification/claim: the same name parts and token as registration (plan §8). */
export class IdClaimDto {
  @ApiProperty({ description: 'Token from POST /auth/id-verification' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  idVerificationToken!: string;

  @ApiProperty({ example: 'Dela Cruz' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'lastName must not be only spaces' })
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'firstName must not be only spaces' })
  @MaxLength(100)
  firstName!: string;

  @ApiPropertyOptional({ example: 'Santos', description: 'Optional. Full middle name or initial.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiPropertyOptional({ example: 'Jr.' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  suffix?: string;

  @ApiPropertyOptional({ description: 'The name does not match; send the ID to MDRRMO staff for review.' })
  @IsOptional()
  // From the raw field: implicit conversion would turn the string 'false' into true.
  @Transform(({ obj }) => obj.requestReview === true || obj.requestReview === 'true')
  @IsBoolean()
  requestReview?: boolean;
}
