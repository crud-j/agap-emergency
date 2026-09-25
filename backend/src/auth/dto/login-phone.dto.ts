import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LoginPhoneDto {
  @ApiProperty({ example: '09171234567' })
  @IsString()
  phoneNumber!: string;

  @ApiProperty({ example: '123456', required: false })
  @IsOptional()
  @IsString()
  otp?: string;
}
