# Plan — Operations Center Web Login Security (no Google Workspace)

**Status:** Phases 0–1 implemented; Phase 2 password policy and forced-change work implemented (migration applied to local development on 2026-10-20) · Phase 3 (MFA + account lockout) implemented 2026-10-20, **migration written but not yet applied to any shared environment** · Phase 4 system-administrator account actions implemented; organization/supervisor scope and frontend actions remain · Phase 5 proposed · **Date:** 2026-10-19 · **Owner:** AGAP backend + frontend
**Modules:** MOD-01 (accounts), MOD-46 (audit), MOD-47 (RBAC), MOD-49 (administration)
**Surfaces affected:** `backend/src/auth`, `backend/src/administration`, `frontend/app/login`, `frontend/lib`, `frontend/middleware.ts`
**Surfaces that must NOT change behaviour:** citizen registration, guest/bystander SOS, mobile login (`mobile/src/services/api/auth.api.ts`)

---

## 1. Problem

The web login at [frontend/app/login/page.tsx](../../frontend/app/login/page.tsx) is the only door into the
Operations Center, Hospital Portal, Administration and Announcements consoles. Today:

- A correct email + password goes straight to the dashboard. There is no second factor.
- The **Google Workspace**, **Remember device** and **Forgot password** controls have no handlers.
- The web has no self-registration (accounts are admin-provisioned for Bocaue MDRRMO, BFP, hospital and LGU
  staff), so there is also no working recovery path for a forgotten password.

Google Workspace sign-in is being dropped. This plan replaces it with authentication that suits a small,
closed, admin-provisioned staff population and fixes the defects found during review.

### Design constraints (from `CLAUDE.md`)

- Rule 14: guest emergency reporting must always be available. **Nothing here may touch the guest/citizen SOS path.**
- Rule 11: every consequential action is auditable → every auth event goes to `AuditLog` (MOD-46).
- Never log passwords, tokens, OTPs or TOTP secrets. The existing `[DEV] … OTP …` log lines must be dev-only.
- Login must never become the reason a dispatcher can't reach the console mid-typhoon. Every lock has an
  instant, audited human override (§6.7).

---

## 2. Verified findings (current code)

Each item was confirmed by reading the code. Items marked **NEW** were missed in the first review.

| # | Severity | Finding | Location |
|---|---|---|---|
| F1 | **Critical** | `resetPassword` looks up the code by `token` alone (`findFirst({ token, status: PENDING })`). It is not bound to a user or phone, so each guess is checked against *every* pending 6-digit code in the system. | [auth.service.ts:300-328](../../backend/src/auth/auth.service.ts#L300-L328) |
| F2 | **Critical** | Reset codes are stored as `verification_type: 'PHONE'`, the same type as registration and phone-login codes. A pending **registration or login OTP can reset that user's password**. | [auth.service.ts:284-292](../../backend/src/auth/auth.service.ts#L284-L292) |
| F3 | **Critical — NEW** | `validateUser` never checks `user.status`. `SUSPENDED` and `DEACTIVATED` accounts can still log in. `refreshToken` doesn't check it either. | [auth.service.ts:36-49](../../backend/src/auth/auth.service.ts#L36-L49), [:191-226](../../backend/src/auth/auth.service.ts#L191-L226) |
| F4 | High — NEW | `administration.service.deactivate()` sets `DEACTIVATED` but does not revoke `user_sessions`. A deactivated user keeps working until their refresh token expires (7 days). | [administration.service.ts:103-115](../../backend/src/administration/administration.service.ts#L103-L115) |
| F5 | High — NEW | `JwtStrategy.validate` trusts any unexpired JWT. It never checks the session, so logout, password reset and deactivation take up to 15 min (`JWT_EXPIRES_IN`) to bite on access tokens. | [jwt.strategy.ts](../../backend/src/auth/strategies/jwt.strategy.ts) |
| F6 | High | `forgotPassword` never sends the SMS. The code only goes to `logger.warn`, which also leaks it into production logs. | [auth.service.ts:294](../../backend/src/auth/auth.service.ts#L294) |
| F7 | High | Web stores the access token in a JS-readable cookie with no `Secure` flag (`document.cookie = agap_token=…`). The refresh token is discarded, so after 15 min the UI looks logged in but every API call 401s. | [login/page.tsx:54](../../frontend/app/login/page.tsx#L54), [lib/auth.ts](../../frontend/lib/auth.ts) |
| F8 | High | There is no per-account lockout, only per-IP throttling (5/min, 10/15 min). | [auth.controller.ts:57-64](../../backend/src/auth/auth.controller.ts#L57-L64) |
| F9 | Medium — NEW | Timing-based account enumeration: `validateUser` returns immediately when the user doesn't exist and runs bcrypt only when they do. | [auth.service.ts:44](../../backend/src/auth/auth.service.ts#L44) |
| F10 | Medium | `ResetPasswordDto` only requires `MinLength(8)`. There's no first-login forced change, and all seeded staff share `AgapDev2026!`. | [reset-password.dto.ts](../../backend/src/auth/dto/reset-password.dto.ts), `docs/USER_ACCOUNTS.md` |
| F11 | Medium | `login()` doesn't update `last_login_at` or write an audit entry. Failed logins aren't recorded anywhere. | [auth.service.ts:51-66](../../backend/src/auth/auth.service.ts#L51-L66) |
| F12 | Low | `middleware.ts` decodes the JWT without verifying the signature or `exp`. That's fine for routing, but it is not access control. | [middleware.ts](../../frontend/middleware.ts) |
| F13 | Low | Dead UI: the Google button, the "Remember device" checkbox and the "Forgot password" button. | [login/page.tsx:361-427](../../frontend/app/login/page.tsx#L361-L427) |

### Correction to the first review

**Passkeys are already a complete sign-in method, not just a second step.**
`WebAuthnService.completeAuthentication()` ends with `return this.authService.login(safeUser)`
([webauthn.service.ts:365](../../backend/src/auth/webauthn.service.ts#L365)). Registration uses `residentKey: 'required'` and
`userVerification: 'required'`, so a passkey on its own is already phishing-resistant multi-factor
(device possession + biometric/PIN). The web should offer **"Sign in with passkey"** as a primary
button, which takes the space the Google button frees. Users who sign in that way skip the password and the second step.

### What already exists and will be reused

- WebAuthn endpoints: `passkey/register/*`, `passkey/authenticate/*`, `passkey/credentials` (+ `@simplewebauthn/server`).
- `user_sessions` with `refresh_token_hash`, `is_revoked`, `device_info`, `ip_address`, `last_active_at`.
- `AuditService.log()` / `logInTransaction()` ([audit.service.ts](../../backend/src/audit/audit.service.ts)).
- `account_lifecycle_events` table (already used by admin activate/deactivate).
- The SMS queue (`QUEUE_NAMES.SMS`, job `otp-sms`) → Textbee.
- The `/auth/change-password` endpoint.

### What does not exist

- No email/SMTP sender in the backend → email reset links are **out of scope** (see §9).
- No encryption helper → one is needed for TOTP secrets (§5.3).
- No `cookie-parser` in the backend.

---

## 3. Target design (summary)

```
                        ┌──────────────────── Web login page ───────────────────┐
                        │  [ Sign in with passkey ]   ← primary, 1 step          │
                        │  ── or ──                                              │
                        │  email + password  → [ Sign in ]                       │
                        │  Forgot password?  → /login/forgot                     │
                        └───────────────────────────────────────────────────────┘
 password OK ──► is staff role (MFA required)?
      │ no ─────────────────────────────────────────► issue session
      │ yes
      ├─ trusted-device cookie valid? ──────── yes ──► issue session
      ├─ MFA enrolled? ── no ──► forced enrollment (TOTP or passkey) ─► issue session
      └─ yes ──► second step: passkey | authenticator code | backup code | SMS (fallback)
                 └─► "Trust this browser for this shift (12 h)" checkbox ─► issue session
 session issued ──► must_change_password? ── yes ──► /login/change-password (blocking)
```

**Roles that require MFA on the web:** `SYSTEM_ADMINISTRATOR`, `ORG_ADMINISTRATOR`, `SUPERVISOR`,
`DISPATCHER`, `HOSPITAL_USER` (has medical-data access), `ANNOUNCEMENTS_PUBLISHER` (can broadcast to the public).
**Unchanged:** `CITIZEN`, `BYSTANDER`, and `RESPONDER` on mobile (§8).

**Authenticators, in order of preference:**
1. **Passkey** (Windows Hello, Android/iOS biometrics, YubiKey). This already exists.
2. **Authenticator app (TOTP, RFC 6238):** Google Authenticator, Microsoft Authenticator, Authy, 2FAS. It works
   offline, which matters during typhoon outages.
3. **Backup codes:** 10 single-use codes, shown once at enrollment.
4. **SMS code via Textbee:** fallback only. It is off by default (`AUTH_SMS_MFA_ENABLED=false`) because the single
   Textbee SIM also carries emergency alert traffic, and SIM swap is a known attack.

**Password recovery:** admin-assisted is the primary path. Self-service by SMS code is allowed only when it is
combined with a second factor (§6.6).

---

## 4. Phases

Each phase can ship on its own and leaves the system working. Do them in order; Phase 0 is urgent.

| Phase | Theme | Ships |
|---|---|---|
| **0** | Stop-the-bleed backend fixes | F1, F2, F3, F4, F6, F9, F11 |
| **1** | Session & token hardening | F5, F7, F12; HttpOnly refresh cookie, in-memory access token, silent refresh |
| **2** | Lockout + password policy + forced change | F8, F10 |
| **3** | MFA (TOTP + backup codes + passkey-first login) + trusted device | F13 (partial) |
| **4** | Recovery & admin controls | admin reset, supervisor override, MFA reset, Forgot-password UI, F13 |
| **5** | Session hygiene | idle lock screen, step-up re-auth, active sessions page, new-device alerts |

---

## 5. Data model changes (Prisma)

Make a single migration per phase. All columns are additive with defaults, so the migrations are safe on existing rows.

### 5.1 Phase 0
```prisma
enum verification_type {
  EMAIL
  PHONE
  PASSWORD_RESET      // NEW — never interchangeable with PHONE/EMAIL
  MFA_SMS             // NEW — Phase 3 SMS fallback
}

model user_verifications {
  // existing fields …
  attempt_count Int @default(0)   // NEW — max 5 attempts per code, then EXPIRED
}

enum audit_action {
  // existing values …
  LOGIN_FAILED        // NEW
  ACCOUNT_LOCKED      // NEW
  ACCOUNT_UNLOCKED    // NEW
  PASSWORD_CHANGE     // NEW (self change, reset, admin temp password)
  MFA_CHANGE          // NEW (enroll, remove, reset)
  SESSION_REVOKED     // NEW
}
```
`PASSWORD_RESET` and `MFA_SMS` codes are stored as **SHA-256 hashes**, never plaintext. The existing
`EMAIL`/`PHONE` rows keep plaintext for now so mobile registration and phone login are not disturbed (follow-up in §9).

### 5.2 Phase 2 — on `User`
```prisma
failed_login_count   Int       @default(0) @db.SmallInt
locked_until         DateTime? @db.Timestamptz(6)
lockout_level        Int       @default(0) @db.SmallInt   // drives progressive lock duration
must_change_password Boolean   @default(false)
password_changed_at  DateTime? @db.Timestamptz(6)
```
In the same migration, set `must_change_password = true` for every non-citizen account (forces seeded staff off `AgapDev2026!`).

### 5.3 Phase 3 — new tables
```prisma
model user_mfa_totp {
  id               String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  user_id          String    @unique @db.Uuid
  secret_encrypted String                      // AES-256-GCM, key = MFA_ENCRYPTION_KEY
  confirmed_at     DateTime? @db.Timestamptz(6) // null = enrollment started, not finished
  last_used_step   BigInt?                      // reject replay of the same 30 s window
  created_at       DateTime  @default(now()) @db.Timestamptz(6)
  users            User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
}

model user_backup_codes {
  id         String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  user_id    String    @db.Uuid
  code_hash  String    @db.VarChar(255)        // bcrypt
  used_at    DateTime? @db.Timestamptz(6)
  created_at DateTime  @default(now()) @db.Timestamptz(6)
  users      User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  @@index([user_id])
}

model trusted_devices {
  id           String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  user_id      String    @db.Uuid
  token_hash   String    @unique @db.VarChar(255)
  label        String?   @db.VarChar(150)       // parsed from user-agent, e.g. "Chrome on Windows"
  ip_address   String?   @db.Inet
  expires_at   DateTime  @db.Timestamptz(6)
  last_used_at DateTime? @db.Timestamptz(6)
  revoked_at   DateTime? @db.Timestamptz(6)
  created_at   DateTime  @default(now()) @db.Timestamptz(6)
  users        User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  @@index([user_id])
}
```
New helper: `backend/src/common/crypto/secret-box.ts`, AES-256-GCM `seal()`/`open()` keyed from `MFA_ENCRYPTION_KEY`
(32 bytes, base64). It fails fast at boot if the key is missing while MFA is enabled.

---

## 6. Implementation detail by phase

### 6.1 Phase 0 — backend fixes (no UI change, no contract change)

> **Implemented 2026-10-19.** It differs from the original text below in these ways:
> - **Status rule:** login, refresh, passkey and phone-OTP block only `SUSPENDED` / `DEACTIVATED`
>   (`backend/src/auth/account-status.ts`, shared with `webauthn.service.ts`). Requiring `ACTIVE` would have
>   locked out every seeded staff account: `seed.ts` sets no `status`, so they default to `PENDING_VERIFICATION`.
> - **No `AUTH_LEGACY_RESET` flag.** `phoneNumber` is required on `/auth/reset-password`, and the mobile app was
>   updated to send it. A legacy path would have reopened F1.
> - **Extra bypass closed:** `verifyPhoneOtp` / `verifyOtp` used to set `status: 'ACTIVE'`, which let a
>   deactivated user re-activate themselves with an SMS login code. Both now reject blocked accounts, and
>   `loginPhone` sends them no code.
> - **Extra fixes:**
>   - `forgotPassword` now normalizes the phone number (`09…` input never matched the stored `+63…` before).
>   - `users.deleteMe` revokes sessions.
>   - The `[OTP verify]` log no longer prints the submitted code or phone number.
>   - Mobile "Resend" in forgot-password mode now requests a reset code, not a login code.
> - `password_changed_at` / lockout / trusted-device clean-up on reset wait for the Phase 2–3 columns.
> - Migration: `backend/prisma/migrations/20261019120000_auth_phase0_hardening`. Tests: `backend/test/auth/auth-phase0.spec.ts`.

**`auth.service.ts`**
1. `validateUser`:
   - When the user is not found or has no `password_hash`, still run `bcrypt.compare` against a constant dummy hash (F9).
   - After a successful compare, reject unless `status === 'ACTIVE'`. Allow `PENDING_VERIFICATION` only for the
     `CITIZEN` role, so current mobile behaviour is preserved; check what mobile registration expects before
     finalizing (F3).
   - Keep the error generic: `Invalid credentials`.
2. `login()`: set `last_login_at`, and store `ip_address` and `device_info` (user-agent) on the session row. Write
   `AuditLog { action: LOGIN, moduleId: 'MOD-01' }` (F11). This needs `@Ip()` / `@Headers('user-agent')` passed
   from the controller.
3. `refreshToken()`: reject when `user.status !== 'ACTIVE'` and revoke that session (F3).
4. `forgotPassword()`:
   - Create the code with `verification_type: 'PASSWORD_RESET'` and store `sha256(code)`.
   - Expire the user's previous pending `PASSWORD_RESET` rows.
   - Enqueue `otp-sms` with *"Your AGAP password reset code is NNNNNN. Expires in 15 minutes. Do not share."* (F2, F6).
   - Keep the `[DEV]` log line only when `NODE_ENV !== 'production'`. Apply the same guard to the existing
     registration and login OTP logs at lines 156 and 372.
5. `resetPassword()` (F1):
   - Accept `phoneNumber` as well as `token`. Look up the user by normalized phone, then the latest pending
     `PASSWORD_RESET` row **for that user**.
   - Increment `attempt_count` atomically. At 5 or more attempts, mark the row `EXPIRED` and fail.
   - Compare hashes with `timingSafeEqual`.
   - On success, in one transaction: update the password, set `password_changed_at`, clear lockout fields (Phase 2),
     mark the row `VERIFIED`, revoke all sessions and trusted devices, and write an audit entry.

**Mobile compatibility for (5):** `mobile/app/auth/reset-password.tsx` currently sends `{ token, newPassword }`.
Update `mobile/src/services/api/auth.api.ts#resetPassword` and the screen to pass the `phoneNumber` already
held from the forgot-password step. **During transition**, the backend accepts a missing `phoneNumber` only when
`AUTH_LEGACY_RESET=true` (default `false` in production), so old builds keep working in dev.

**`administration.service.ts`**
6. `deactivate()`: in the same transaction, revoke all `user_sessions` (`is_revoked: true`) and write
   `SESSION_REVOKED` (F4). Also add the session-revocation hook from Phase 1 (§6.2 step 4).

**Tests** (`backend/test/auth/`)
- A registration OTP cannot reset the password.
- A reset code for user A cannot reset user B.
- The 6th attempt fails even when the code is correct.
- A deactivated user gets 401 on login and on refresh.
- Unknown-user and wrong-password responses are identical in body, and their timing is within tolerance.

### 6.2 Phase 1 — session & token hardening

> **Implemented 2026-10-19** (no DB migration needed). It differs from the original text below in these ways:
> - **Refresh rotates in place.** The session row is updated rather than replaced, so `sid` is stable for the
>   whole login. Revoking it cuts *every* access token from that login, including ones in other tabs.
>   A replayed or concurrent refresh with an already-rotated token loses a conditional update and gets 401.
> - **Revocation module:** `backend/src/auth/sessions/` (`SessionsModule`). Redis key `auth:revoked:<sid>`, with a
>   TTL equal to `JWT_EXPIRES_IN`.
>   - It **fails open** when Redis is down or slow (>250 ms). This is deliberate, so dispatchers are never
>     locked out by a Redis outage. The DB still stops the session at its next refresh.
> - **Live sockets close on revocation.** The gateway puts each socket in a `session:<sid>` room and disconnects
>   that room when the session is revoked. This is an in-process event; a multi-instance deployment would need
>   Redis pub/sub instead.
> - **Cross-tab handling:**
>   - Web Locks serialize refreshes across tabs, so tabs don't race on the rotating cookie.
>   - A `BroadcastChannel` makes logout in one tab end all tabs.
> - **Web session response:** `{ accessToken, user: { id, email, role, name, orgId, orgName } }`.
>   - `orgId`, `orgName` and `name` were always `undefined` before, because the JWT never carried them.
>   - Mobile responses are byte-for-byte unchanged.
> - **Logout** uses `OptionalJwtAuthGuard`, so an expired access token can still sign out via the refresh cookie.
> - **Backend unreachable:** the session is kept, and `AuthGate` shows a visible "Cannot reach the AGAP server"
>   state that retries automatically instead of logging the user out.
> - **Also fixed (Phase 0 follow-ups):**
>   - Per-account reset caps: at most 3 codes and 10 wrong guesses per hour, across all codes and IPs.
>   - `TRUST_PROXY` (default `loopback, linklocal, uniquelocal`), so `req.ip` is the real client behind nginx.
>     This also makes per-IP throttling per client; before, everyone behind nginx shared one bucket.
> - Tests: `backend/test/auth/auth-phase1.spec.ts` and `session-revocation.spec.ts`.
>   Smoke-tested over HTTP: login → refresh → logout → both old access tokens 401 immediately.

**Approach:** the refresh token goes in an **HttpOnly cookie** set by the backend, and the access token lives
**in memory only** in the browser. This keeps the 130 existing `getToken()` call sites in `frontend/features/**`
unchanged, because only the implementation of `getToken()` changes. Mobile keeps receiving tokens in the JSON body.

**Backend**
1. Add `cookie-parser` in `main.ts`. CORS already has `credentials: true`.
2. Distinguish clients by the request header `X-AGAP-Client: web`:
   - **web** → `login`, `refresh`, `mfa/verify` and `passkey/authenticate/complete` set
     `agap_refresh` (`HttpOnly; Secure=${COOKIE_SECURE}; SameSite=Strict; Path=/; Max-Age=7d`) and return
     `{ accessToken, user }` **without** `refreshToken` in the body.
   - **anything else** (mobile) → current behaviour, unchanged.
3. `POST /auth/refresh`: read the refresh token from the body (mobile) **or** the `agap_refresh` cookie (web). Cookie
   refresh **requires** the `X-AGAP-Client: web` header. A custom header forces a CORS preflight, which together with
   `SameSite=Strict` blocks CSRF. Return `{ accessToken, user: { id, role, fullName, orgId, orgName, mustChangePassword } }`.
4. Add a `sid` (session id) claim to the access token. In `JwtStrategy.validate`, reject when `sid` is in the Redis set
   `auth:revoked:<sid>`. Write that key with TTL = access-token lifetime whenever a session is revoked
   (logout, reset, deactivate, admin revoke) (F5). It's one Redis `EXISTS` per request, with no DB hit.
   Apply the same check in the WebSocket handshake ([agap.gateway.ts:41-48](../../backend/src/realtime/agap.gateway.ts#L41-L48)).
5. `POST /auth/logout`: also clear the `agap_refresh` cookie.
6. New env vars in `.env.example`: `COOKIE_SECURE=true`, `COOKIE_DOMAIN=` (blank = host-only).

**Frontend**
1. `frontend/lib/auth.ts`:
   - Replace the cookie read with a module-level in-memory token (or a small Zustand store).
   - `getToken()` keeps its signature.
   - `setSession({ accessToken, user })` and `clearSession()` replace `clearToken()`.
2. New `frontend/lib/session.ts`:
   - `refreshSession()` → `POST /v1/auth/refresh` with `credentials: 'include'` and `X-AGAP-Client: web`.
   - Concurrent callers share one in-flight promise.
   - Schedule the next refresh 60 s before `exp`.
3. New `frontend/providers/auth-bootstrap.tsx`, mounted in `app/(ops)/layout.tsx` and the hospital/admin layouts:
   - On mount, call `refreshSession()` and render a small "Restoring session…" state until it resolves.
   - On failure, `router.replace('/login?next=…')`.
4. `frontend/lib/api.ts#request`: on `401`, call `refreshSession()` once, rebuild the `Authorization` header from
   `getToken()`, and retry. If that fails too, clear the session and redirect to login. Add
   `credentials: 'include'` only to `/auth/*` calls.
5. `frontend/lib/websocket.ts`: change `s.auth = { token }` to the callback form
   `s.auth = (cb) => cb({ token: getToken() })` so reconnects after a refresh use the new token.
6. `frontend/lib/use-auth.ts`: read the user from the session store (from the refresh/login response), not from
   decoding the cookie.
7. `frontend/middleware.ts` (F12):
   - Gate on the **presence** of the `agap_refresh` cookie only, and redirect to `/login?next=` if it's missing.
   - Remove JWT decoding.
   - Move the `HOSPITAL_USER` path scoping into the layouts, using the session user. The backend still enforces it.
8. `login/page.tsx`: send `X-AGAP-Client: web` and `credentials: 'include'`, call `setSession()`, and remove the
   `document.cookie` write.
9. `Topbar.tsx` logout: `POST /auth/logout`, then `clearSession()`.

**Dev note:** in dev, the backend (`:3000`) and frontend (`:3001`) are the same site (`localhost`), so `SameSite=Strict`
cookies flow, and browsers treat `localhost` as secure. In production, nginx serves both from one origin
(`/v1/` → backend, `/` → frontend; see `infrastructure/nginx/nginx.conf`).

**Acceptance:**
- No token is visible to `document.cookie`.
- Leaving a tab open for over 15 min keeps working without a visible logout.
- Logging out in one tab 401s the other tab within one request.
- The mobile login and refresh E2E tests are unchanged and pass.

### 6.3 Phase 2 — lockout, password policy, forced change

> **Implemented 2026-10-20 — lockout intentionally deferred.** The Phase 2 password-policy and forced-change
> work is implemented; account lockout will ship with Phase 3 trusted-device support, not on its own.
> - The Phase 2 migration adds `must_change_password` and `password_changed_at`, and marks existing web-console
>   staff for a forced change. It is applied to the local development database; other environments still need it.
> - Forced change covers web-console roles only. Mobile-only `RESPONDER` accounts are excluded so the existing
>   mobile login flow and response shape remain unchanged.
> - A global password-change guard checks signed JWTs, skips explicit public routes, and allows only change
>   password and logout for a forced-change session. Existing controller-level JWT/RBAC guards remain in place.
>   WebSocket handshakes reject forced-change tokens too.
> - The password policy is used for reset and authenticated change: 12–128 characters, no composition rules,
>   reject account-name/email terms and AGAP/Bocaue, and reject the first 10,000 entries from the pinned
>   `@zxcvbn-ts/language-common` ranked password dictionary. This avoids a runtime network dependency and a
>   separately vendored wordlist.
> - New password hashes pre-hash with domain-separated SHA-256 before bcrypt, so accepted passwords longer than
>   bcrypt's 72-byte input limit remain distinct. Existing bcrypt hashes continue to verify unchanged.
> - The mobile reset-password form was updated to match the server's 12–128 length rule; mobile registration
>   and login behavior are unchanged.

**Lockout** (password step only; applies to the MFA roles in §3):
- **Implemented in Phase 3** (2026-10-20), together with trusted-device exemptions, as agreed. Wrong second-step
  codes also count toward the same counter (§6.4).
- On a failed password, increment `failed_login_count`.
- At 5 failures, set `locked_until = now + duration(lockout_level)`, increment `lockout_level`, and reset the count.
  Durations are **15 min → 30 min → 60 min (cap)**. A successful login resets the count and `lockout_level`.
- While locked, return the same generic `Invalid credentials` plus `423`-style detail **only after** the password is
  correct (prevents lock-state probing): *"Account temporarily locked. Try again in N min or ask your Supervisor."*
- **Trusted devices are exempt from the lock.** A login presenting a valid `agap_trusted` cookie for that user skips
  the lock check, so an attacker guessing from outside cannot lock a dispatcher out of their own console.
  This is the key emergency-ops safeguard.
- On lock, write `ACCOUNT_LOCKED` to the audit log and send an SMS to the account holder (*"AGAP: your account was locked after
  failed sign-ins. If this wasn't you, tell your Supervisor."*), only when the phone is on file.
- `CITIZEN` accounts: no lock, only the existing IP throttle. SOS doesn't depend on login anyway.

**Password policy** (new `backend/src/auth/password-policy.ts`, used by change, reset and admin set):
- Minimum length 12, maximum 128. No composition rules (NIST 800-63B).
- Reject passwords containing the user's email local-part, name or `agap`/`bocaue`.
- Reject passwords in a bundled list of the top 10k common passwords (`backend/src/auth/data/common-passwords.txt`).
- *Optional:* HaveIBeenPwned k-anonymity range check behind `AUTH_HIBP_CHECK=true`, with a 2 s timeout that
  **fails open** if the internet is down.
- Apply to `ChangePasswordDto` and `ResetPasswordDto` (replace `MinLength(8)`), with the same rules shown in the web UI.

**Forced change:**
- Every response that issues a session includes `user.mustChangePassword`.
- When true, the web redirects to `/login/change-password` and the auth bootstrap blocks every other route.
- The backend rejects all non-auth endpoints with `403 PASSWORD_CHANGE_REQUIRED` via a global guard that checks
  a `pwc: true` claim in the JWT.
- `change-password` clears the flag, sets `password_changed_at`, revokes other sessions and writes an audit entry.

### 6.4 Phase 3 — MFA

> **Implemented 2026-10-20 (with account lockout).** Migration `20261020120000_auth_phase3_mfa_lockout` adds
> `users.failed_login_count / locked_until / lockout_level` and the `user_mfa_totp`, `user_backup_codes` and
> `trusted_devices` tables. It was generated from a read-only diff of the live schema and verified on a throwaway
> database (all 14 migrations apply; the end-to-end flows below ran against it); **it has not been applied to the
> local development database or any other environment.** Applying it is required before the backend runs: the
> regenerated Prisma client selects the new `users` columns.
>
> **What shipped**
> - Backend (`backend/src/auth/mfa/`, `lockout/`, `common/crypto/secret-box.ts`): TOTP (`otplib` 12.0.1, SHA-1, 6 digits,
>   30 s, ±1 step, replay-proof via `last_used_step`), ten bcrypt-hashed single-use backup codes, trusted browsers
>   (`agap_trusted`, HttpOnly, SameSite=Strict, 12 h, SHA-256 at rest), single-use 5-minute `mfaToken` (5 wrong codes
>   kill it), SMS fallback behind `AUTH_SMS_MFA_ENABLED` (hashed, 5 min, 5 attempts, 3 codes/hour), passkey as a second
>   step, and `amr` + `auth_time` on every access token (kept across refreshes).
> - Lockout: 5 failures → 15 → 30 → 60 min (cap). Disclosed only after the password is right (`423`, code
>   `ACCOUNT_LOCKED`); a valid trusted-browser cookie is exempt; citizens, bystanders and responders are never locked.
>   `ACCOUNT_LOCKED` is audited and the holder is texted.
> - Frontend: `/login` (email-first, passkey-first sign-in; Google and the dead “Remember device” removed; “Forgot
>   password?” wired), `/login/verify`, `/login/enroll`, `/login/change-password`, `/login/setup-passkey`,
>   `/login/setup-authenticator`, `/login/forgot`, `/account/security` (linked from the top bar), strings in `en`
>   and `fil`.
> - Config: `MFA_ENCRYPTION_KEY`, `AUTH_MFA_ENFORCED`, `AUTH_SMS_MFA_ENABLED` (boot fails if enforcement is on without a key).
- The web login is email-first and passkey-first. Password mode remains available, and browsers without WebAuthn
  support fall back to password mode automatically. A cancellable passkey progress overlay is shown inside the login
  card only after a short delay, so immediately failed requests do not flash it.
- After a forced password change, users without a factor are guided through optional passkey and authenticator
  setup at `/login/setup-passkey` and `/login/setup-authenticator`; either step can be skipped. The authenticator
  step displays one-time backup codes and requires confirmation that they were saved before continuing.
- The login card remembers up to five account names and email addresses in browser-local storage only. The account
  picker shows live-session status, supports inline password sign-in, allows removing remembered entries, and never
  stores passwords, tokens or MFA material. The mandatory `/login/enroll` flow remains separate and has no skip.
>
> **Deliberate differences from the text below**
> - `mfaToken` is signed with an HMAC-derived key (not `JWT_SECRET` itself), so it can never validate as an access token.
>   Its `jti` and failure counter live in Redis **with an in-process fallback that fails closed** (an unseen token is rejected).
> - Forced enrollment issues the session on the first confirmed code (the `confirm` response carries the session and
>   the backup codes); the web page only hands the session to the console after “I saved these”.
> - **Passkey registration is not offered inside forced enrollment**: the existing `passkey/register/*` endpoints need a
>   full JWT. Staff add a passkey from Account security; a passkey-only user counts as enrolled.
> - **Step-up stand-in:** regenerating backup codes and removing the authenticator app re-ask for the password (wrong
>   guesses count toward the lock) until Phase 5 provides `/auth/step-up`. Removing the last factor is refused only
>   while `AUTH_MFA_ENFORCED=true`.
> - A trusted-browser sign-in records `amr: ["pwd"]` (the second step was not performed). Trusted browsers are revoked on
>   password change/reset and on removing the authenticator; MFA reset and admin revoke arrive with Phase 4, as does
>   `GET /admin/users?mfa=none`.
> - `/login/forgot` is the info-only screen (the default `AUTH_SELF_SERVICE_RESET=false` mode); the flag itself is Phase 4.
> - Mobile: a staff account that now owes a second step gets “This account signs in on the Operations Center web console.”
>
> **Found while verifying (pre-existing, fixed):** on a Postgres server whose session time zone is not UTC (this
> machine: `Asia/Kuala_Lumpur`), Prisma's pg adapter wrote every timestamp 8 hours early — so a 5-minute SMS code was
> stored already expired, a 12 h trusted-browser window lasted 4 h, and audit timestamps were wrong. `PrismaService`
> now pins the connection to UTC (`options: '-c timezone=UTC'`). Rows written before the fix keep their shifted times.
>
> **Verification:** 59 new unit tests (`backend/test/auth/auth-phase3.spec.ts`; backend suite 27 suites / 320 tests);
> 94 scripted checks against a real PostgreSQL database (93 passed; the other was a mistake in the script itself — it
> sent the web header, so the refresh token correctly went to the cookie, not the body) covering forced enrollment →
> forced password change → refresh, replay and wrong codes, trusted-browser skip/revocation, backup-code single use and
> regeneration, real lockout and its trusted-browser exemption, the rollout window, JWT-path enrollment, SMS fallback
> expiry, and unchanged citizen/responder logins. **Not covered:** a real WebAuthn ceremony (needs an authenticator —
> covered with mocks) and the new pages in a browser (production build and route smoke test only).

**Library:** `otplib` (TOTP, SHA-1, 6 digits, 30 s, ±1 step window) and `qrcode` (server-side data URL).

**Login contract change** (web and non-mobile clients):
`POST /auth/login` for an MFA role, after the password is OK, returns **200**:
```json
{ "mfaRequired": true, "mfaToken": "<JWT, 5 min, purpose=mfa, sub=userId>", "methods": ["passkey","totp","backup_code","sms"], "enrollmentRequired": false }
```
`methods` lists only what the user has enrolled (and `sms` only if `AUTH_SMS_MFA_ENABLED`). If the user has no factor,
the response has `enrollmentRequired: true` and `methods: []`.

**New endpoints** (`backend/src/auth/mfa/`: `mfa.controller.ts`, `mfa.service.ts`, `totp.service.ts`, `backup-codes.service.ts`, `trusted-device.service.ts`):

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /auth/mfa/verify` | `mfaToken` | `{ method: 'totp' \| 'backup_code' \| 'sms', code, trustDevice?: boolean }` → session (+ `agap_trusted` cookie if requested) |
| `POST /auth/mfa/sms/send` | `mfaToken` | Sends an `MFA_SMS` code (hashed, 5 min, 5 attempts). Only if enabled. |
| `POST /auth/mfa/passkey/begin` · `/complete` | `mfaToken` | Reuses `WebAuthnService` with `allowCredentials` = this user's credentials, then issues a session |
| `POST /auth/mfa/totp/enroll` | `mfaToken` (enrollment) or JWT | Creates an unconfirmed secret and returns `{ otpauthUrl, qrDataUrl, secret }` |
| `POST /auth/mfa/totp/confirm` | same | Verifies the first code → `confirmed_at`, generates 10 backup codes and returns them **once** |
| `POST /auth/mfa/backup-codes/regenerate` | JWT + step-up | Invalidates the old set and returns a new one once |
| `DELETE /auth/mfa/totp` | JWT + step-up | Removes TOTP (refused if it's the user's last factor and the role requires MFA) |
| `GET /auth/mfa/status` | JWT | `{ totp: bool, passkeys: n, backupCodesRemaining: n, trustedDevices: [...] }` |
| `DELETE /auth/trusted-devices/:id` | JWT | Revoke one trusted browser |

Rules:
- `mfaToken` is single-use. Store its `jti` in Redis with a 5 min TTL and delete it on use. Five wrong codes against
  one `mfaToken` kill it, and those failures count toward the account lockout counter.
- TOTP: reject `step <= last_used_step` (replay).
- Backup codes: 10 codes, each 10 chars from `[a-z2-9]` shown as `xxxxx-xxxxx`, bcrypt-hashed, single use. Warn
  in the UI when 3 or fewer remain.
- **Trusted device** ("Trust this browser for this shift"): a 32-byte random token goes in an
  `agap_trusted` HttpOnly cookie (12 h, `SameSite=Strict`) with a hashed row in `trusted_devices`. The password is
  **still required**; only the second step is skipped. Revoked on password change, MFA reset or admin revoke.
- Passkey-first login (`/passkey/authenticate/*`) stays a full login with no extra step, because `userVerification: 'required'`.
- The access token carries `amr` (`["pwd","otp"]`, `["pwd","hwk"]`, `["hwk"]`) and `auth_time` for Phase 5 step-up.
- Audit everything: `MFA_CHANGE` on enroll and remove, and `LOGIN` with `{ amr }` in `new_values`.

**Frontend** (`frontend/app/login/`):
- `page.tsx`:
  - Remove the Google button and use its slot for **Sign in with passkey** (`@simplewebauthn/browser`).
  - Remove the "Remember device" checkbox from this step.
  - Wire "Forgot password" to `/login/forgot`.
  - Add the `X-AGAP-Client` header.
  - Branch on `mfaRequired`.
- New `app/login/verify/page.tsx`: method picker plus a code input with `autocomplete="one-time-code"`, a passkey
  button, a "Use a backup code" link, and the **Trust this browser for this shift (12 h)** checkbox.
  The `mfaToken` is held in memory only; a page refresh returns to `/login`.
- New `app/login/enroll/page.tsx`:
  - Shows the QR code and manual key, then a confirmation code.
  - Then shows the backup codes with Download/Print and an "I saved these" checkbox (required to continue).
  - Also offers "Register a passkey instead" (it can call the existing `passkey/register/*` with a short-lived
    enrollment session).
- New `app/(ops)/account/security/page.tsx`: manage passkeys, TOTP, backup codes and trusted browsers.
- Add strings to `frontend/lib/i18n` for both `en` and `fil`.

**Rollout flag:** `AUTH_MFA_ENFORCED=false` first. While false, enrollment is offered but skippable, and
`mfaRequired` is only returned when the user has enrolled. Flip it to `true` once all staff have enrolled.
`GET /admin/users?mfa=none` shows who is left.

### 6.5 Phase 4 — admin reset, supervisor override, MFA reset

> **Implemented slice 2026-10-20:** system administrators can now unlock accounts, issue one-time temporary
> passwords, reset TOTP/backup-code/trusted-browser enrollment, revoke all sessions, and list MFA-less staff
> with `GET /api/v1/administration/users?mfa=none`. Each mutating action requires a reason of at least 10
> characters, writes an `account_lifecycle_events` row and an `AuditLog` entry, blocks self-targeting, and
> immediately revokes access-token sessions through the existing revocation service. Temporary passwords are
> returned once and force a password change. Organization-administrator and supervisor scoping, step-up
> re-authentication, SMS delivery, and the administration frontend remain outstanding Phase 4 work.

New endpoints in `backend/src/administration/` (with RBAC via the existing guards and permissions):

| Endpoint | Who | Effect |
|---|---|---|
| `POST /admin/users/:id/unlock` | SYSTEM_ADMINISTRATOR; ORG_ADMINISTRATOR (own org); **SUPERVISOR (own-org DISPATCHER/RESPONDER only)** | Clears the lock fields |
| `POST /admin/users/:id/temporary-password` | same as unlock | Generates a 14-char temporary password and sets `must_change_password = true`. Revokes sessions and trusted devices. Returns the password **once** to the actor's screen, with an optional SMS to the user's phone. |
| `POST /admin/users/:id/mfa/reset` | SYSTEM_ADMINISTRATOR; ORG_ADMINISTRATOR (own org) | Deletes TOTP, backup codes and trusted devices; passkeys are optional. The user must enroll at next login. |
| `DELETE /admin/users/:id/sessions` | SYSTEM_ADMINISTRATOR; ORG_ADMINISTRATOR (own org) | Revokes all sessions (Redis `sid` revocation too) |

Rules:
- Every action requires a free-text `reason` (min 10 chars) and writes **both** `account_lifecycle_events` and `AuditLog`.
- These actions require step-up re-auth (Phase 5). Until Phase 5 lands, require that the actor's `auth_time` is within the last 15 min.
- An actor can't use these on their own account.
- The SMS to the target uses wording that names no one, e.g. *"AGAP: your password was reset by an administrator. If unexpected, call MDRRMO."*
- **Supervisor override = the break-glass path.** The on-shift Supervisor can get a locked-out dispatcher back on the
  console in under a minute without a System Admin.

**Frontend:** add row actions in `frontend/app/administration` users table (Unlock, Issue temporary password,
Reset MFA, Sign out everywhere), each with a reason dialog. Show the temporary password in a copy-once modal.

**Forgot password, web (`app/login/forgot/page.tsx`)**, two modes driven by `AUTH_SELF_SERVICE_RESET`:
- `false` (**default; recommended**): an info screen. *"Contact your MDRRMO Supervisor or System Administrator to
  reset your password,"* with the MDRRMO ops number (from public config, not hard-coded).
- `true`:
  - Enter phone → SMS code → new password.
  - **Plus a second-factor check** (TOTP, backup code or passkey) for MFA roles. A stolen SIM alone can't take over a staff account.
  - The response to the phone step is always the generic *"If the account exists…"*.

### 6.6 Phase 5 — session hygiene

> **Implemented slice 2026-10-20:** the backend now exposes `POST /auth/step-up`, which verifies the current
> session password and refreshes `auth_time` on the same session, plus `GET /auth/sessions` and
> `DELETE /auth/sessions/:id` for active-session management. `@RequireRecentAuth(15)` / `RecentAuthGuard` protects
> administration mutations, system-configuration writes, MFA backup-code regeneration, authenticator removal, and
> session revocation; stale requests receive `401 STEP_UP_REQUIRED`. The web console has a role-based idle lock
> (15 minutes for system administrators, 60 minutes for operations/hospital users) with an in-place password unlock.
> WebSocket connections and incident-alert UI remain mounted behind the lock. The account security page lists and
> revokes active sessions, and `STEP_UP_REQUIRED` opens the same unlock surface instead of redirecting to login.
>
> **Still outstanding in Phase 5:** passkey-based step-up, configurable idle thresholds from `system_configurations`,
> incident-count display on the lock screen, new-device audit/in-app notification (and admin SMS), and full
> step-up coverage for every user/role-management, surge-mode, and configuration mutation.

1. **Idle lock screen** (frontend): after inactivity (`ADMIN: 15 min`, `OPS/HOSPITAL: 60 min`; configurable in
   `system_configurations`), overlay a lock screen that requires the password or a passkey.
   - **The WebSocket stays connected and new-incident sound alerts keep playing.** The lock screen shows
     *"N new incidents — unlock to view"* with no incident details.
   - Unlock calls `POST /auth/step-up`.
2. **Step-up re-auth:**
   - `POST /auth/step-up` (password + second factor, or passkey) issues a fresh access token with a new `auth_time`.
   - A `@RequireRecentAuth(15)` decorator plus guard returns `401 STEP_UP_REQUIRED`, which the frontend handles
     with a modal and a retry.
   - Apply it to: user and role management, the §6.5 endpoints, MFA changes, `system_configurations` writes, and surge-mode activation.
   - **Do not** apply it to incident status changes, dispatch or closure. Those happen under time pressure and are already audited.
3. **Active sessions page** (`/account/security`):
   - List `user_sessions` (device label, IP, last active) and trusted devices, with revoke buttons.
   - Update `last_active_at` on refresh, not on every request.
4. **New-device alert:** when a session starts from a browser with no trusted-device record and a user-agent/IP
   pair not seen in 30 days, write an audit entry and create an in-app notification (`notification.created`).
   SMS only for admin roles.

---

## 7. Security checklist (applies to every phase)

- [ ] No password, token, OTP, TOTP secret or backup code in logs, error messages, audit `new_values` or SMS (other than the code itself in its own SMS).
- [ ] Every new public endpoint has `@Throttle` (5/min, 10/15 min for code-verification endpoints).
- [ ] Every code comparison uses `crypto.timingSafeEqual` on hashes.
- [ ] Generic responses on login and forgot-password. No account enumeration by body, status or timing.
- [ ] All auth events go to `AuditLog` with `moduleId: 'MOD-01'` (admin ones `'MOD-49'`), actor, IP and user-agent.
- [ ] Cookies: `HttpOnly`, `Secure` in production, `SameSite=Strict`, `Path=/`.
- [ ] `.env.example` updated: `COOKIE_SECURE`, `COOKIE_DOMAIN`, `MFA_ENCRYPTION_KEY`, `AUTH_MFA_ENFORCED`,
      `AUTH_SMS_MFA_ENABLED`, `AUTH_SELF_SERVICE_RESET`, `AUTH_HIBP_CHECK`.
- [ ] `docs/USER_ACCOUNTS.md` updated: seeded staff must change their password on first login. Explain the MFA enrollment step.

---

## 8. Compatibility & non-goals

- **Mobile:** it doesn't send `X-AGAP-Client: web`, so it keeps getting JSON tokens.
  - `RESPONDER`, `CITIZEN` and `BYSTANDER` are not in the MFA role list, so mobile login is unchanged.
  - Mobile *does* need the Phase 0 `resetPassword` payload change (adding `phoneNumber`).
  - If a staff MFA role ever signs in on mobile, it will receive `mfaRequired`. Mobile must show "Use the
    Operations Center web console" until mobile MFA exists (follow-up).
- **Guest / SOS:** untouched. `register/guest`, `/alerts` and the incident creation paths get no new guards.
- **Google Workspace / OAuth:** removed and not replaced. No external identity provider dependency.
- **Email-based reset:** out of scope; there is no mailer. Revisit if an LGU SMTP relay becomes available.

---

## 9. Follow-ups (not in this plan)

- Hash the existing `EMAIL`/`PHONE` verification codes and add attempt limits to `verifyPhoneOtp` (mobile login OTP).
- MFA on the mobile Responder app (passkey support already exists there).
- Optional CAPTCHA (Cloudflare Turnstile) after 3 failures. It's deferred because the account lockout plus trusted-device exemption covers the
  same risk without an extra external dependency during connectivity outages.
- Periodic access review report: staff with no login in 90 days get auto-flagged for deactivation.

---

## 10. Test plan

| Layer | Location | Cases |
|---|---|---|
| Unit | `backend/test/auth/*.spec.ts` | password policy; TOTP window and replay; backup-code single use; lockout progression; trusted device bypasses the lock; `mfaToken` single use; reset bound to user; reset type isolation |
| Integration | `backend/test/auth/auth.e2e-spec.ts` | full web flow (cookie set, refresh, logout clears); mobile flow unchanged (body tokens); deactivated user is blocked on login, refresh, REST and WS within one request; admin temporary password → forced change |
| Frontend | Playwright (`tests/e2e/web-auth.spec.ts`) | password → forced password change → optional passkey/authenticator onboarding → TOTP → dashboard; passkey-first login (virtual authenticator); account picker; 16-minute idle tab still works; forced change blocks navigation; lock screen keeps the incident-alert badge updating |
| Regression | existing emergency-flow E2E | **must pass unchanged** after every phase (per `CLAUDE.md`) |

---

## 11. Rollout

1. Ship Phase 0 immediately; it contains no UI or behaviour change for legitimate users.
2. Ship Phases 1–2 together. Announce to staff: *"You'll be asked to set a new password on next login."*
3. Ship Phase 3 with `AUTH_MFA_ENFORCED=false`. Run a 1–2 week enrollment window at the MDRRMO ops center, where the
   admin helps each dispatcher register Windows Hello on their console PC plus an authenticator app on their phone.
4. Set `AUTH_MFA_ENFORCED=true`.
5. Ship Phases 4–5.

Before each rollout step, confirm a System Administrator and at least one Supervisor per shift have working MFA
and know the unlock/temporary-password procedure.
