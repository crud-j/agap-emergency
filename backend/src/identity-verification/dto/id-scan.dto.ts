import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Multipart fields sent with the ID image (POST /auth/id-verification). */
export class IdScanDto {
  @ApiProperty({ description: 'The citizen agreed to the PhilHealth ID check. Must be true.' })
  @IsOptional()
  // From the raw field: implicit conversion would already have turned the string 'false' into true.
  @Transform(({ obj }) => obj.consentGiven === true || obj.consentGiven === 'true')
  @IsBoolean()
  consentGiven?: boolean;

  @ApiProperty({ example: 14.7977, description: 'Device GPS latitude — same Bocaue geo-fence as registration' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 120.9374, description: 'Device GPS longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ description: "The phone's own reading of the card. Compared only; never stored or trusted." })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  clientText?: string;

  @ApiPropertyOptional({ example: 1, description: 'Which scan attempt this is (1 = first)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  attemptNumber?: number;

  @ApiPropertyOptional({
    description:
      'Send this scan to MDRRMO staff if the server cannot read it. Honoured from the third attempt on; a readable card is processed normally.',
  })
  @IsOptional()
  // From the raw field, like consentGiven.
  @Transform(({ obj }) => obj.requestReview === true || obj.requestReview === 'true')
  @IsBoolean()
  requestReview?: boolean;
}
