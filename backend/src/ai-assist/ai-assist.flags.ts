/** Anything with ConfigService's `get`, so callers outside AiAssistModule can check the flag. */
interface ConfigLike {
  get<T = string>(key: string): T | undefined;
}

/**
 * AI Assist is on only when the flag is 'true' and the Gemini key and model are both set
 * (config validation already refuses to boot with the flag on and either one missing).
 * Pure, so BarangayReplyService can check it without importing AiAssistModule (K10:
 * that module imports the barangay callback module, so the reverse would be a cycle).
 */
export function aiAssistEnabled(config: ConfigLike): boolean {
  return (
    config.get<string>('AI_ASSIST_ENABLED') === 'true' &&
    !!config.get<string>('GEMINI_API_KEY')?.trim() &&
    !!config.get<string>('GEMINI_MODEL')?.trim()
  );
}
