/** Anything with ConfigService's `get`, so callers outside AiAssistModule can check the flag. */
interface ConfigLike {
  get<T = string>(key: string): T | undefined;
}

/** Who answers AI Assist calls. One setting for every task (barangay replies, analytics summary). */
export type AiProvider = 'gemini' | 'openai';

/** `AI_ASSIST_PROVIDER`: 'openai' or 'gemini' (the default, so existing setups are unchanged). */
export function aiAssistProvider(config: ConfigLike): AiProvider {
  return config.get<string>('AI_ASSIST_PROVIDER')?.trim().toLowerCase() === 'openai' ? 'openai' : 'gemini';
}

/** The exact model ID for the provider: GEMINI_MODEL or OPENAI_AI_ASSIST_MODEL. No fallback. */
export function aiAssistModel(config: ConfigLike): string {
  const key = aiAssistProvider(config) === 'openai' ? 'OPENAI_AI_ASSIST_MODEL' : 'GEMINI_MODEL';
  return config.get<string>(key)?.trim() ?? '';
}

/** The provider's API key: GEMINI_API_KEY or OPENAI_API_KEY. */
export function aiAssistApiKey(config: ConfigLike): string {
  const key = aiAssistProvider(config) === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
  return config.get<string>(key)?.trim() ?? '';
}

/**
 * AI Assist is on only when the flag is 'true' and the chosen provider's key and model are
 * both set (config validation already refuses to boot with the flag on and either one
 * missing). Pure, so BarangayReplyService can check it without importing AiAssistModule
 * (K10: that module imports the barangay callback module, so the reverse would be a cycle).
 */
export function aiAssistEnabled(config: ConfigLike): boolean {
  return config.get<string>('AI_ASSIST_ENABLED') === 'true' && !!aiAssistApiKey(config) && !!aiAssistModel(config);
}
