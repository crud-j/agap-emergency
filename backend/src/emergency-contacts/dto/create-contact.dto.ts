import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ example: 'Maria dela Cruz' })
  @IsString()
  contactName!: string;

  @ApiPropertyOptional({ example: 'Spouse' })
  @IsOptional()
  @IsString()
  relationship?: string;

  @ApiProperty({ example: '09171234567' })
  @IsString()
  phoneNumber!: string;

  @ApiPropertyOptional({ example: 'maria@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  priorityOrder?: number;
}
