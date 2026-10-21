import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  /** Binds the code to one account — a code alone is never enough. */
  @ApiProperty({ example: '09171234567' })
  @IsString()
  @Matches(/^(\+63|0)9\d{9}$/, {
    message: 'phoneNumber must be a valid Philippine mobile number',
  })
  phoneNumber!: string;

  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
