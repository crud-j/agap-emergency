/**
 * The AGAP SMS number: the Textbee phone's SIM. With no mobile data, "Send by SMS" opens
 * the messages app with the report addressed here (MOD-17 / MOD-19); the backend reads it
 * from that phone and texts the reference back.
 *
 * Set EXPO_PUBLIC_AGAP_SMS_NUMBER in the app's env (mobile/.env, EAS env for builds). It is
 * read when Metro bundles, so a change needs a Metro restart, not a native rebuild. Unset
 * or malformed hides every SMS option: the hotlines are always shown instead.
 */
const raw = process.env.EXPO_PUBLIC_AGAP_SMS_NUMBER?.replace(/[\s-]/g, '');

export const AGAP_SMS_NUMBER: string | null = raw && /^\+?\d{10,13}$/.test(raw) ? raw : null;
