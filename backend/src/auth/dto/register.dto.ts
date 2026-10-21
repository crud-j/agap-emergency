import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, Matches, IsOptional, IsEmail, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { UserSex } from '@agap/shared';

export class RegisterDto {
  @ApiProperty({ example: 'Juan dela Cruz' })
  @IsString()
  fullName!: string;

  @ApiPropertyOptional({
    enum: UserSex,
    description: 'Optional. Used only for the reporter map icon. Omit when not chosen — never required.',
  })
  @IsOptional()
  @IsEnum(UserSex, { message: 'sex must be MALE, FEMALE or PREFER_NOT_TO_SAY' })
  sex?: UserSex;

  @ApiProperty({
    example: '09171234567',
    description: 'Philippine mobile number — 09XXXXXXXXX or +639XXXXXXXXX',
  })
  @IsString()
  @Matches(/^(\+63|0)9\d{9}$/, {
    message: 'phoneNumber must be a valid Philippine mobile number (e.g. 09171234567 or +639171234567)',
  })
  phoneNumber!: string;

  @ApiPropertyOptional({ example: 'juan@example.com', description: 'Optional — enables email-based login and email OTP verification' })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  @ApiProperty({
    example: 'S3curePass!',
    minLength: 8,
    maxLength: 128,
    description: 'At least 8 characters with uppercase, lowercase, number, and symbol',
  })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  @MaxLength(128, { message: 'password must be no more than 128 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,128}$/, {
    message: 'password must include an uppercase letter, lowercase letter, number, and symbol',
  })
  password!: string;

  @ApiProperty({ example: 'S3curePass!' })
  @IsString()
  confirmPassword!: string;

  @ApiPropertyOptional({
    example: 14.7977,
    description: 'WGS-84 latitude from device GPS — used for geo-fence validation',
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    example: 120.9374,
    description: 'WGS-84 longitude from device GPS — used for geo-fence validation',
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
