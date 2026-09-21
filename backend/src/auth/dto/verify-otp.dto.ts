import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ enum: ['EMAIL', 'PHONE'] })
  @IsIn(['EMAIL', 'PHONE'])
  type!: 'EMAIL' | 'PHONE';
}
