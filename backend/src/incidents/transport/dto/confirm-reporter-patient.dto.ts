import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ConfirmReporterPatientDto {
  @ApiProperty({
    description:
      'true: the crew confirms the person being carried is the registered reporter (C17). false: withdraw it.',
  })
  @IsBoolean()
  confirmed!: boolean;
}
