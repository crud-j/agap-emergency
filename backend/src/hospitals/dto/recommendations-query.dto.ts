import { IsUUID } from 'class-validator';

/** GET /v1/hospitals/recommendations?incidentId= (C6). */
export class RecommendationsQueryDto {
  @IsUUID()
  incidentId!: string;
}
