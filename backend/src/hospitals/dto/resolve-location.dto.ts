import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

/** POST /hospitals/resolve-location: what staff typed (public facility data only). */
export class ResolveLocationDto {
  @ApiProperty({ example: "Dr. Yanga's Hospital, Inc." })
  @IsString()
  @Length(2, 255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'Bocaue' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  municipality?: string;

  @ApiPropertyOptional({ example: 'Bulacan' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;
}
