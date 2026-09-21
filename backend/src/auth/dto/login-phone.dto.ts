import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginPhoneDto {
  @ApiProperty({ example: '09171234567' })
  @IsString()
  phoneNumber!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  otp!: string;
}
