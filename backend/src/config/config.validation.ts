import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';
import { parseEncryptionKey } from '../common/crypto/secret-box';
import { normalizePhPhone } from '@agap/shared';

/** ID_PIN_PEPPER: a short pepper would let a leaked pin_hmac be brute-forced over the 10^12 PINs. */
export const MIN_PIN_PEPPER_LENGTH = 32;

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  REDIS_URL: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsNumber()
  @IsOptional()
  BACKEND_PORT: number = 3000;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:3001';

  // Web session cookie (docs/plans/WEB_AUTH_SECURITY_PLAN.md §6.2).
  // COOKIE_SECURE: 'true' | 'false'; unset = Secure only when NODE_ENV=production.
  @IsString()
  @IsOptional()
  COOKIE_SECURE?: string;

  // Blank = host-only cookie (recommended).
  @IsString()
  @IsOptional()
  COOKIE_DOMAIN?: string;

  // Web-console MFA (docs/plans/WEB_AUTH_SECURITY_PLAN.md §6.4).
  // MFA_ENCRYPTION_KEY: 32 random bytes, base64 — seals TOTP seeds at rest. Generate with
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  // Without it authenticator-app enrollment is unavailable (passkeys still work).
  @IsString()
  @IsOptional()
  MFA_ENCRYPTION_KEY?: string;

  // MEDICAL_ENCRYPTION_KEY: 32 random bytes, base64 — seals medical profile fields at
  // rest (MOD-03 / MOD-48). Separate from MFA_ENCRYPTION_KEY. Required in production;
  // without it a medical profile cannot be saved (dispatch is never affected).
  @IsString()
  @IsOptional()
  MEDICAL_ENCRYPTION_KEY?: string;

  // ID verification at registration (MOD-01 / MOD-48). 'true' = /auth/register
  // requires a scan, which needs ID_DOCUMENT_ENCRYPTION_KEY (32 bytes, base64, sealing the
  // name and image) and ID_PIN_PEPPER (HMAC secret for the one-ID-per-account check).
  @IsString()
  @IsOptional()
  ID_VERIFICATION_REQUIRED?: string;

  @IsString()
  @IsOptional()
  ID_DOCUMENT_ENCRYPTION_KEY?: string;

  @IsString()
  @IsOptional()
  ID_PIN_PEPPER?: string;

  // 'true' = staff roles without a second factor must enroll at next sign-in. Leave
  // 'false' during the enrollment window: enrollment is offered but skippable.
  @IsString()
  @IsOptional()
  AUTH_MFA_ENFORCED?: string;

  // 'true' = allow an SMS code as a fallback second factor. Off by default: the single
  // Textbee SIM also carries emergency traffic, and SIM-swap is a known attack.
  @IsString()
  @IsOptional()
  AUTH_SMS_MFA_ENABLED?: string;

  // Express 'trust proxy': which hops may set X-Forwarded-For (real client IP).
  @IsString()
  @IsOptional()
  TRUST_PROXY: string = 'loopback, linklocal, uniquelocal';

  @IsString()
  @IsOptional()
  STORAGE_ENDPOINT: string = 'http://localhost:9000';

  @IsString()
  @IsOptional()
  STORAGE_BUCKET: string = 'agap-media';

  @IsString()
  @IsOptional()
  STORAGE_ACCESS_KEY: string = '';

  @IsString()
  @IsOptional()
  STORAGE_SECRET_KEY: string = '';

  @IsString()
  @IsOptional()
  STORAGE_REGION: string = 'us-east-1';

  // Textbee SMS gateway (MOD-17). Optional: when unset the SMS processor logs
  // and no-ops, so OTP/alert flows still succeed without SMS delivery.
  @IsString()
  @IsOptional()
  TEXTBEE_API_KEY: string = '';

  @IsString()
  @IsOptional()
  TEXTBEE_DEVICE_ID: string = '';

  @IsString()
  @IsOptional()
  MDRRMO_OPS_PHONE: string = '';

  // Barangay alert SMS (MOD-17 / MOD-34, docs/plans/BARANGAY_ALERT_AUTOMATION_PLAN.md
  // Phase 3). 'true' = text the barangay's primary + backup numbers on every report.
  // Keep 'false' until MDRRMO has verified the barangay numbers.
  @IsString()
  @IsOptional()
  BARANGAY_ALERTS_ENABLED?: string;

  // Every barangay SMS goes to this number instead of the barangay. Required outside
  // production while alerts are on, so no real barangay phone is texted from dev.
  @IsString()
  @IsOptional()
  BARANGAY_SMS_TEST_OVERRIDE_PHONE?: string;

  // Minutes to wait for the barangay to report back before one reminder SMS and the
  // "has not reported back" banner (Phase 4). Default 20.
  @IsString()
  @IsOptional()
  BARANGAY_FOLLOWUP_MINUTES?: string;

  // Barangay SMS replies (Phase 5). 'true' = read replies such as `DONE 3526` sent to the
  // Textbee phone, record them like a status-page tap, and add the reply hint to alerts.
  // A reply never changes incident status. Default off.
  @IsString()
  @IsOptional()
  BARANGAY_SMS_REPLIES_ENABLED?: string;

  // How replies arrive: 'poll' (default; reads Textbee every 15 s, needs no public URL) or
  // 'webhook' (receiver not built yet; needs a stable public HTTPS address).
  @IsString()
  @IsOptional()
  BARANGAY_SMS_INBOUND_MODE?: string;

  // MOD-53: process announcement subscribers' STOP replies to the Textbee phone (RA 10173).
  // Default on ('true'); the inbound poll runs for it even with barangay replies off.
  @IsString()
  @IsOptional()
  SMS_OPT_OUT_ENABLED?: string;

  // MOD-53 (ROLE_DASHBOARDS_PLAN.md Phase 7). 'true' = a CRITICAL advisory needs an
  // MDRRMO Supervisor's approval before release. Default off: publishing as before.
  @IsString()
  @IsOptional()
  ANNOUNCEMENT_APPROVAL_REQUIRED?: string;

  // Public base URL of the web app (no trailing slash), e.g. https://agap.example.ph.
  // Barangays save <PUBLIC_APP_URL>/b once and type the access code from the alert SMS.
  // Never sent in an SMS (carriers drop texts with web addresses); informational for the
  // dev scripts. Must be reachable from the barangay's phone, so localhost does not work.
  @IsString()
  @IsOptional()
  PUBLIC_APP_URL?: string;

  // Optional dedicated key for signing those links. Falls back to a key derived from JWT_SECRET.
  @IsString()
  @IsOptional()
  BARANGAY_LINK_SECRET?: string;

  // Map provider abstraction (MOD-11/12/13/43). Tiles follow MAP_PROVIDER;
  // geocoding + routing default to the OSS/OSM stack regardless. Point the URLs
  // at self-hosted services for cost control, privacy, and surge availability.
  @IsString()
  @IsOptional()
  MAP_PROVIDER: string = 'mapbox';

  @IsString()
  @IsOptional()
  MAP_API_KEY: string = '';

  @IsString()
  @IsOptional()
  MAP_PROVIDER_ROUTING_URL: string = 'http://router.project-osrm.org';

  // Routing engine for ETA: 'osrm' (free, free-flow; default) or 'mapbox'
  // (traffic-aware; requires MAP_API_KEY). Falls back to OSRM when unset/invalid.
  @IsString()
  @IsOptional()
  MAP_ROUTER: string = 'osrm';

  @IsString()
  @IsOptional()
  MAP_GEOCODER_URL: string = 'https://nominatim.openstreetmap.org';

  // Hospital destination routing (MOD-40/43). Default on: the ETA job routes each unit
  // to where it is heading now (scene or hospital), caches the route and pushes
  // responder.route_updated. 'false' = scene route only, no route events, no cache.
  @IsString()
  @IsOptional()
  TRANSPORT_ROUTING_ENABLED?: string;

  // C17 launch switch (MOD-40/48). Default off: a crew confirmation that the reporter is
  // the patient never shows that reporter the hospital, and the confirm endpoint is
  // refused. Turn on ('true') only after the LGU Data Protection Officer signs off.
  @IsString()
  @IsOptional()
  REPORTER_DESTINATION_SHARING_ENABLED?: string;

  // Tier 2 evidence review (MOD-10/MOD-25) — an advisory AI plausibility check on
  // submitted photos, run async after upload. Never blocks upload or dispatch.
  // Unset = the check is skipped entirely; Tier 1 provenance scoring still runs.
  @IsString()
  @IsOptional()
  OPENAI_API_KEY: string = '';

  @IsString()
  @IsOptional()
  OPENAI_EVIDENCE_REVIEW_MODEL: string = 'gpt-4o-mini';

  // Hospital "Find location" name assist (MOD-39). Optional; unset = the evidence
  // review model. The AI only cleans names and breaks ties, never gives coordinates.
  @IsString()
  @IsOptional()
  OPENAI_GEOCODE_ASSIST_MODEL?: string;

  // AI Assist (AI_ASSIST_PLAN, AUTOMATION_NEEDS_PLAN Phase 3): Gemini reads free-text
  // barangay replies and suggests a status a dispatcher accepts. Suggestions only, never
  // in the emergency path. Off unless 'true'; then GEMINI_API_KEY and GEMINI_MODEL are required.
  @IsString()
  @IsOptional()
  AI_ASSIST_ENABLED?: string;

  @IsString()
  @IsOptional()
  GEMINI_API_KEY?: string;

  // An exact, stable model ID (no preview, no "-latest" alias). No fallback.
  @IsString()
  @IsOptional()
  GEMINI_MODEL?: string;

  @IsNumber()
  @IsOptional()
  AI_ASSIST_TIMEOUT_MS: number = 8000;

  // Hard cap on calls per day across the system (budgets only alert; this stops calls).
  @IsNumber()
  @IsOptional()
  AI_ASSIST_DAILY_LIMIT: number = 500;

  @IsString()
  @IsOptional()
  MAP_STYLE_URL: string = '';
}

export function validateConfig(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.toString()}`);
  }

  // Fail fast at boot rather than at the first dispatcher's sign-in.
  const mfaKey = parseEncryptionKey(validatedConfig.MFA_ENCRYPTION_KEY);
  const medicalKey = parseEncryptionKey(validatedConfig.MEDICAL_ENCRYPTION_KEY, 'MEDICAL_ENCRYPTION_KEY');
  if (validatedConfig.NODE_ENV === Environment.Production && !medicalKey) {
    throw new Error('Configuration validation failed: MEDICAL_ENCRYPTION_KEY is required in production');
  }
  if (validatedConfig.AUTH_MFA_ENFORCED === 'true' && !mfaKey) {
    throw new Error('Configuration validation failed: AUTH_MFA_ENFORCED=true requires MFA_ENCRYPTION_KEY');
  }
  const idDocumentKey = parseEncryptionKey(validatedConfig.ID_DOCUMENT_ENCRYPTION_KEY, 'ID_DOCUMENT_ENCRYPTION_KEY');
  if (validatedConfig.ID_VERIFICATION_REQUIRED === 'true') {
    if (!idDocumentKey) {
      throw new Error(
        'Configuration validation failed: ID_VERIFICATION_REQUIRED=true requires ID_DOCUMENT_ENCRYPTION_KEY',
      );
    }
    if ((validatedConfig.ID_PIN_PEPPER?.trim().length ?? 0) < MIN_PIN_PEPPER_LENGTH) {
      throw new Error(
        `Configuration validation failed: ID_VERIFICATION_REQUIRED=true requires ID_PIN_PEPPER (at least ${MIN_PIN_PEPPER_LENGTH} characters)`,
      );
    }
  }

  if (
    validatedConfig.BARANGAY_ALERTS_ENABLED === 'true' &&
    validatedConfig.NODE_ENV !== Environment.Production &&
    !normalizePhPhone(validatedConfig.BARANGAY_SMS_TEST_OVERRIDE_PHONE).canSms
  ) {
    throw new Error(
      'Configuration validation failed: BARANGAY_ALERTS_ENABLED=true outside production requires ' +
        'BARANGAY_SMS_TEST_OVERRIDE_PHONE (a PH mobile number)',
    );
  }

  if (
    validatedConfig.AI_ASSIST_ENABLED === 'true' &&
    (!validatedConfig.GEMINI_API_KEY?.trim() || !validatedConfig.GEMINI_MODEL?.trim())
  ) {
    throw new Error('Configuration validation failed: AI_ASSIST_ENABLED=true requires GEMINI_API_KEY and GEMINI_MODEL');
  }

  return validatedConfig;
}
