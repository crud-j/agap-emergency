import { IsString, MinLength } from 'class-validator';

export class StepUpDto {
  @IsString()
  @MinLength(1)
  password!: string;
}
