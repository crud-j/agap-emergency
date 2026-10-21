import { Injectable } from '@nestjs/common';
import {
  IncidentType,
  recommendIntakePriority,
  type IntakeAnswers,
  type IntakePriorityRecommendation,
} from '@agap/shared';

/**
 * MOD-24 — assistive priority. The rules live in @agap/shared so intake and
 * the dispatch console recommend the same thing; the dispatcher always
 * confirms the final priority in triage.
 */
@Injectable()
export class PriorityService {
  recommend(type: IncidentType, answers: IntakeAnswers = {}): IntakePriorityRecommendation {
    return recommendIntakePriority(type, answers);
  }
}
