export const AI_EVENTS = {
  /** AI Assist: a suggestion row was stored (any status), so the drawer refetches. */
  SUGGESTION_CREATED: 'ai.suggestion_created',
} as const;

export type AiEventName = (typeof AI_EVENTS)[keyof typeof AI_EVENTS];

/** Ops-only. IDs and the row's status only: the drawer refetches the suggestion. */
export interface AiSuggestionCreatedPayload {
  suggestionId: string;
  /** Null for suggestions with no incident (none today). */
  incidentId: string | null;
  kind: string;
  status: string;
}
