import { PartialType } from '@nestjs/swagger';
import { CreateMedicalProfileDto } from './create-medical-profile.dto';

export class UpdateMedicalProfileDto extends PartialType(CreateMedicalProfileDto) {}
