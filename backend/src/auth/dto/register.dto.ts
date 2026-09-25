import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, Matches } from 'class-validator';

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

  @ApiProperty({ example: 'S3curePass!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'S3curePass!' })
  @IsString()
  confirmPassword!: string;
}
