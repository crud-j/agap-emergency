import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, Matches, IsOptional, IsEmail, IsNumber, Min, Max } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Juan dela Cruz' })
  @IsString()
  fullName!: string;

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

  @ApiProperty({ example: 'S3curePass!', minLength: 8 })
  @IsString()
  @MinLength(8)
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
