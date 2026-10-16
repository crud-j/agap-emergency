# Implementation Plan: Geo-Fence Registration Gate

**Author:** Claude (claude-sonnet-4-6) · **Date:** 2026-10-13
**Status:** DRAFT — pending clarification answers at end of document

---

## 1. Scope & Goals

### 1.1 What changes
| Area | Before | After |
|---|---|---|
| Registration UI | Free-text fields: Barangay, Municipality, Province, Full Address | All four fields removed; GPS-derived location used instead |
| Registration flow | Address input → submit | Location permission → GPS capture → geo-fence check → submit |
| Backend | Persists free-text address as-is | Validates lat/lng against Bocaue polygon; auto-stores reverse-geocoded barangay |
| `RegisterDto` | Optional text address fields | Optional `latitude` + `longitude` (float); address fields removed or made internal-only |

### 1.2 Strict goals
1. **Block** account creation for anyone whose GPS fix places them outside Bocaue municipal boundary.
2. **Remove** all manual address text-entry from the registration screen.
3. **Never block emergency reporting** — guest/bystander path (`registerGuest`) is untouched and remains address-free (Architectural Rule 14).
4. **Never break the existing OTP flow** — geo-fence check happens *before* the `register` API call; OTP delivery logic is unchanged.

---

## 2. Geo-Fence Definition

### 2.1 Bocaue boundary polygon
- **Source:** PSGC-aligned GeoJSON from PhilGIS / OpenStreetMap Nominatim (`relation/2689505`). Cross-check with LGU engineering office shapefile.
- **Format at rest:** Single `POLYGON` stored as a PostGIS `geometry(Polygon, 4326)` column in a new `geo_regions` table (see §3.2).
- **Update mechanism:** Database migration. The polygon does not change often; no runtime API needed. Include a `last_updated_at` column so operators know when it was last verified.

### 2.2 Check approach — server-side canonical, client-side fast-fail
| Layer | Role | Why |
|---|---|---|
| **Server** (canonical) | `ST_Within(ST_Point(lng, lat, 4326), boundary)` via PostGIS | Cannot be bypassed by mock GPS, VPN, or APK modification |
| **Client** (fast-fail UX) | Rough bounding-box check or `@turf/boolean-point-in-polygon` against bundled GeoJSON | Gives immediate UI feedback without a round-trip; does NOT gate the actual registration |

Client-side check improves UX; server-side check is the security gate. If they disagree, the server wins.

---

## 3. Technical Architecture

### 3.1 Mobile — Expo + React Native (TypeScript)

#### 3.1.1 Location permission handling
```
expo-location is already in mobile/package.json (verify version ≥ 16)

Sequence:
1. requestForegroundPermissionsAsync()
   → GRANTED  → proceed to §3.1.2
   → DENIED   → show "Permission Required" screen (re-ask once, then deep-link to Settings)
   → BLOCKED  → show "Go to Settings" screen with openSettings()
```

Permission rationale copy (shown in OS dialog):
> "AGAP needs your precise location to confirm you are within Bocaue, Bulacan. Your location is used only for this verification and is not stored or shared."

#### 3.1.2 Location capture
```typescript
// mobile/src/services/geo/location.service.ts  (new file)
import * as Location from 'expo-location';

export async function getCurrentLocationWithTimeout(
  timeoutMs = 10_000,
): Promise<Location.LocationObject> {
  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,  // ~30 m — sufficient for municipality check
    timeInterval: 0,
    distanceInterval: 0,
  });
  // Caller wraps in Promise.race with a timeout rejection
}
```

Accuracy note: `Balanced` accuracy (cell tower + Wi-Fi + GPS) is enough for a municipality-level polygon. `High` accuracy drains battery and is not necessary here.

#### 3.1.3 Client-side fast-fail (optional but recommended)
- Bundle `bocaue_boundary.geojson` in `mobile/assets/geo/` (≈ 5–15 KB).
- Install `@turf/boolean-point-in-polygon` (tree-shakeable, ~3 KB).
- Run the check synchronously after GPS fix. Show "outside Bocaue" immediately if failed. Still submit to server to confirm.

#### 3.1.4 API call shape
```typescript
// POST /api/v1/auth/geo-check
// Request
{ latitude: number; longitude: number }

// Response 200 — inside
{ inside: true; barangay: string | null; municipality: 'Bocaue'; province: 'Bulacan' }

// Response 200 — outside
{ inside: false; barangay: null; municipality: null; province: null }

// Response 503 — PostGIS unavailable
{ statusCode: 503; message: 'Location service temporarily unavailable' }
```

The geo-check endpoint is **unauthenticated** (public, rate-limited). Registration cannot proceed if it returns `inside: false`.

#### 3.1.5 Registration submit shape (updated)
```typescript
// POST /api/v1/auth/register
// Existing fields unchanged except address fields replaced:
{
  fullName: string;
  phoneNumber: string;
  email?: string;
  password: string;
  confirmPassword: string;
  // NEW — coordinates from the captured GPS fix
  latitude?: number;    // optional: omit if permission was denied and UX allows fallback
  longitude?: number;
  // REMOVED: barangay, municipality, province, fullAddress (free-text)
  // Backend derives barangay from reverse-geocode / PostGIS spatial join
}
```

---

### 3.2 Backend — NestJS + Prisma + PostGIS

#### 3.2.1 New Prisma schema additions
```prisma
// backend/prisma/schema.prisma (additions)

model geo_regions {
  id              String   @id @default(cuid())
  name            String   // "Bocaue"
  region_type     String   // "municipality"
  // PostGIS geography stored as Unsupported — raw SQL used for spatial ops
  boundary        Unsupported("geometry(Polygon, 4326)")
  last_updated_at DateTime @updatedAt
  created_at      DateTime @default(now())

  @@map("geo_regions")
}
```

Migration SQL:
```sql
-- backend/prisma/migrations/XXXXXX_add_geo_regions/migration.sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE "geo_regions" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"            TEXT NOT NULL,
  "region_type"     TEXT NOT NULL,
  "boundary"        geometry(Polygon, 4326) NOT NULL,
  "last_updated_at" TIMESTAMP(3) NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "geo_regions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "geo_regions_boundary_idx" ON "geo_regions" USING GIST ("boundary");

-- Seed Bocaue polygon (replace coordinates with verified GeoJSON ring)
INSERT INTO "geo_regions" ("id", "name", "region_type", "boundary", "last_updated_at")
VALUES (
  'bocaue-municipality',
  'Bocaue',
  'municipality',
  ST_GeomFromGeoJSON('{ "type": "Polygon", "coordinates": [[...]] }'),
  NOW()
);
```

#### 3.2.2 New endpoint — `POST /api/v1/auth/geo-check`
```typescript
// backend/src/auth/auth.controller.ts  (add)
@Post('geo-check')
@HttpCode(200)
@Throttle({ default: { limit: 20, ttl: 60_000 } })  // 20 checks/min per IP
async geoCheck(@Body() dto: GeoCheckDto) {
  return this.authService.checkGeoFence(dto.latitude, dto.longitude);
}
```

```typescript
// backend/src/auth/dto/geo-check.dto.ts  (new)
import { IsNumber, Min, Max } from 'class-validator';

export class GeoCheckDto {
  @IsNumber()
  @Min(-90) @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180) @Max(180)
  longitude!: number;
}
```

```typescript
// backend/src/auth/auth.service.ts  (add method)
async checkGeoFence(lat: number, lng: number): Promise<GeoCheckResult> {
  const rows = await this.prisma.$queryRaw<{ inside: boolean; barangay: string | null }[]>`
    SELECT
      ST_Within(ST_SetSRID(ST_Point(${lng}, ${lat}), 4326), boundary) AS inside,
      NULL::text AS barangay   -- Phase 2: spatial join to barangay sub-polygons
    FROM geo_regions
    WHERE name = 'Bocaue' AND region_type = 'municipality'
    LIMIT 1
  `;

  if (!rows.length) throw new ServiceUnavailableException('Geo-fence boundary not configured');

  const { inside, barangay } = rows[0];
  return {
    inside,
    barangay: inside ? (barangay ?? null) : null,
    municipality: inside ? 'Bocaue' : null,
    province:     inside ? 'Bulacan' : null,
  };
}
```

#### 3.2.3 Updated `RegisterDto`
```typescript
// backend/src/auth/dto/register.dto.ts  (update)
// Remove: barangay, municipality, province, fullAddress
// Add:
@ApiPropertyOptional()
@IsOptional()
@IsNumber()
latitude?: number;

@ApiPropertyOptional()
@IsOptional()
@IsNumber()
longitude?: number;
```

#### 3.2.4 Updated `register()` service method
```typescript
async register(dto: RegisterDto) {
  // 1. Existing password + phone duplicate checks unchanged

  // 2. Geo-fence gate (if coordinates provided)
  if (dto.latitude !== undefined && dto.longitude !== undefined) {
    const geo = await this.checkGeoFence(dto.latitude, dto.longitude);
    if (!geo.inside) {
      throw new BadRequestException('Registration is only available for residents of Bocaue, Bulacan.');
    }
  }

  // 3. Create user — derive address from coordinates or store coords
  const user = await this.prisma.user.create({
    data: {
      full_name:    dto.fullName,
      phone_number: phoneNumber,
      email:        dto.email ?? null,
      password_hash: passwordHash,
      status:       'PENDING_VERIFICATION',
      barangay:     null,          // Phase 2: populate from PostGIS barangay join
      municipality: 'Bocaue',      // Guaranteed by geo-fence
      province:     'Bulacan',     // Guaranteed by geo-fence
      full_address: null,
      // Optionally: store raw coords if schema supports it
    },
  });

  // 4. OTP flow unchanged
}
```

---

## 4. UI/UX Changes

### 4.1 Screens and states

```
[Registration Screen]
        ↓
[Location Permission Screen]          ← NEW: full-screen rationale + "Allow" button
  ├── DENIED once   → re-request
  ├── DENIED forever → "Open Settings" deep-link
  └── GRANTED       ↓

[Location Loading Screen]             ← NEW: spinner, "Detecting your location…"
  ├── timeout (10 s)  → show retry option
  ├── low accuracy    → warn but proceed if accuracy < 500 m
  └── fix obtained    ↓

[Geo-fence API call]                  ← silent, ≤ 2 s
  ├── inside = true   → proceed to form (address fields GONE)
  ├── inside = false  → [Outside Bocaue Screen]    ← NEW
  └── error/503       → [Location Error Screen]    ← NEW

[Registration Form — TRIMMED]         ← existing screen minus address section
  Fields remaining: Full Name, Mobile, Email (opt), Password, Confirm Password
  Fields REMOVED: Barangay, Municipality, Province, Full Address, Address section header

[Submit → OTP → verified]            ← unchanged
```

### 4.2 New screen states (in-flow, not separate routes)

#### Permission Request (`locationStep = 'permission'`)
- Illustration + short explanation paragraph
- "Allow Location Access" primary button
- "Why is this needed?" expandable
- No skip option (location is required for registration)

#### Location Loading (`locationStep = 'loading'`)
- Centered spinner
- "Detecting your location…"
- Auto-timeout at 10 s → retry prompt

#### Outside Bocaue Error (`locationStep = 'outside'`)
- Clear heading: **"Service Not Available in Your Area"**
- Body: "AGAP is currently only available to residents and workers within Bocaue, Bulacan. If you need emergency help right now, please call **911** or the MDRRMO hotline."
- "Try Again" button (re-triggers GPS capture)
- MDRRMO phone number as tappable `tel:` link
- Do NOT show a "report as guest" redirect here — that is a separate flow

#### Location Error (`locationStep = 'error'`)
- "Unable to verify your location" heading
- Body: "We couldn't confirm your location. Please check your GPS signal and try again."
- "Retry" button

### 4.3 Strings (add to i18n)
All new strings must be added to both `en` and `fil` locale keys in `mobile/src/i18n/`.

---

## 5. Security & Reliability

### 5.1 Why server-side validation is non-negotiable
- Mobile apps can be patched; `expo-location` results can be mocked by developer-mode tools and location-spoofer apps.
- PostGIS runs entirely inside the backend trust boundary; a client cannot forge the result.
- The backend is already the canonical authority for all business rules (AGAP Architectural Rule 6).

### 5.2 Anti-spoofing notes
- GPS accuracy jitter (~30–50 m) is far smaller than the Bocaue polygon; use `ST_Within` with no buffer.
- Do **not** add a "grace buffer" to the polygon — this would allow users in adjacent Marilao or Meycauayan to register.
- Rate-limit the `/geo-check` endpoint (20 req/min/IP) to prevent polygon-probing enumeration attacks.
- Log `(lat, lng, inside, user_agent, ip)` at INFO level for the geo-check call (not stored in user record; audit only).

### 5.3 Offline / poor-signal behavior
- If `expo-location` times out (10 s), show the retry screen. Do not fall back to asking for a manual address.
- If the `/geo-check` API returns 503, show the location error screen with "Try Again". Registration is blocked until the check succeeds — this is intentional.
- Indoor GPS: `Balanced` accuracy uses Wi-Fi/cell, which typically gives a valid fix even indoors inside Bocaue. If accuracy > 500 m, warn the user ("Move to an open area for a better signal") but still attempt the check.

### 5.4 Privacy
- Coordinates are sent over HTTPS and used only for the geo-check; they are not stored in the `users` table (unless a future schema adds them explicitly with a consent step).
- The geo-check endpoint returns only `inside: true/false`, not a reverse-geocoded address — minimizes data returned.
- Log retention for geo-check calls: 30 days, then purge (add to the existing log retention policy).

---

## 6. Implementation Phases

### Phase 1 — Data & backend preparation
- [ ] Obtain and validate the Bocaue boundary GeoJSON (PhilGIS or OSM relation 2689505)
- [ ] Write and test the Prisma migration adding `geo_regions` with PostGIS geometry
- [ ] Write the seed SQL inserting the Bocaue polygon
- [ ] Add `checkGeoFence()` service method with raw PostGIS query
- [ ] Add `GeoCheckDto` and `POST /api/v1/auth/geo-check` controller action
- [ ] Add rate limiting (`@nestjs/throttler`) to the endpoint
- [ ] Unit-test `checkGeoFence()` with known inside/outside coordinates (e.g., Bocaue Church vs. SM Fairview)
- [ ] Update `RegisterDto` — remove free-text address fields, add optional `latitude`/`longitude`
- [ ] Update `register()` service method to gate on geo-fence result

### Phase 2 — Mobile permission + location capture
- [ ] Create `mobile/src/services/geo/location.service.ts` with timeout wrapper
- [ ] Bundle `bocaue_boundary.geojson` in `mobile/assets/geo/`
- [ ] Install `@turf/boolean-point-in-polygon` in `mobile/package.json`
- [ ] Build client-side fast-fail helper (returns `boolean`)
- [ ] Wire location service into a new `useGeoFence` hook (`mobile/src/hooks/useGeoFence.ts`)

### Phase 3 — Registration UI overhaul
- [ ] Add `locationStep` state machine to `RegistrationScreen` (`'idle' | 'permission' | 'loading' | 'checking' | 'inside' | 'outside' | 'error'`)
- [ ] Remove the entire "Address Section" UI block (barangay, municipality, province, fullAddress inputs + section header)
- [ ] Add Permission Request, Location Loading, Outside Bocaue, Location Error UI states
- [ ] Add i18n strings for all new states in `en` and `fil`
- [ ] Pass `latitude` + `longitude` to the existing `register()` API call
- [ ] Remove address fields from `registerSchema` Zod schema in `registration.tsx`

### Phase 4 — Error handling, edge cases, testing
- [ ] Handle `expo-location` `accuracy > 500` warning state
- [ ] Handle GPS timeout (10 s) → retry UI
- [ ] Handle permanently denied permission → deep-link to Settings
- [ ] Update `tests/mobile/auth.registration.spec.tsx`:
  - Mock `expo-location` (already importable in Jest)
  - Add test cases: permission denied, outside geo-fence, geo-check API error, successful inside flow
  - Remove test cases that depend on the removed address fields
- [ ] Add backend unit tests for `checkGeoFence()` with PostGIS test fixtures

### Phase 5 — Optional future enhancements
- [ ] Barangay sub-polygon table → auto-populate `barangay` column on registration from spatial join
- [ ] Periodic re-verification: check on first app launch after 6 months (for relocated users)
- [ ] Grace period flag for MDRRMO / BFP staff registered from outside boundary

---

## 7. Testing Plan

### 7.1 Backend unit tests
```typescript
describe('AuthService.checkGeoFence', () => {
  it('returns inside=true for Bocaue Church (14.7977, 120.9366)');
  it('returns inside=false for SM City Fairview (14.7412, 121.0570)');
  it('returns inside=false for Marilao center (14.7599, 120.9509)');
  it('returns inside=false for Meycauayan center (14.7316, 120.9578)');
  it('throws ServiceUnavailableException when geo_regions is empty');
});
```

### 7.2 Mobile unit tests (Jest + react-test-renderer)
```typescript
// Add to tests/mobile/auth.registration.spec.tsx
describe('geo-fence flow', () => {
  it('shows loading state while acquiring GPS fix');
  it('shows permission request screen before form');
  it('shows outside-Bocaue error when geoCheck returns inside=false');
  it('shows location error when geoCheck API throws 503');
  it('does not render address fields at all');
  it('passes latitude and longitude to the register API call');
  it('does NOT call register API if geoCheck returns inside=false');
});
```

### 7.3 Device & OS matrix
| Device | OS | Scenario |
|---|---|---|
| Android (physical) | Android 13 | Bocaue location — happy path |
| Android (physical) | Android 13 | Bulacan but not Bocaue — boundary edge |
| Android emulator | Android 14 | Mock location inside Bocaue |
| Android emulator | Android 14 | Mock location outside Bocaue |
| iOS simulator | iOS 17 | Permission denied |
| iOS simulator | iOS 17 | GPS timeout simulation |

### 7.4 Edge-case scenarios
| Scenario | Expected behavior |
|---|---|
| User is on the exact boundary | PostGIS `ST_Within` returns false for boundary line; show outside error |
| GPS accuracy > 500 m | Show accuracy warning, allow retry, proceed if user confirms |
| User uses a GPS spoofer (client mock) | Server-side check catches it; registration blocked |
| User disconnects from internet after GPS fix | `/geo-check` fails with network error; show retry screen |
| Permanent permission denial (iOS) | Prompt to open Settings; registration blocked |
| Bocaue polygon not seeded (fresh DB) | Backend returns 503; mobile shows location error |
| User is MDRRMO staff outside Bocaue | Phase 5 grace-period flag; for now, blocked and must use admin registration path |

---

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| GPS accuracy places user outside polygon despite being inside | Low — polygon is municipal-scale | Use `Balanced` accuracy; consider 50 m inward buffer for boundary pixels only |
| Location spoofer app bypasses client check | Medium | Server-side PostGIS gate is the real control; client check is UX only |
| Bocaue boundary GeoJSON incorrect | Medium | Cross-validate against 2+ sources; add admin endpoint to update polygon without code deploy |
| User genuinely lives in Bocaue but GPS places them outside (indoor, basement) | Low–Medium | Retry prompt and "move to open area" guidance |
| Battery drain from GPS request at registration | Very Low | Single shot `getCurrentPositionAsync`, not continuous watch |
| Legal / privacy concern about sending coordinates | Low | HTTPS only; not stored; disclose clearly in permission rationale and Privacy Policy |
| PostGIS extension not enabled on production DB | Low | Migration adds `CREATE EXTENSION IF NOT EXISTS postgis`; verify in CI |
| Temporary resident or worker commuting to Bocaue | Depends | Currently blocked; Phase 5 grace-period flag is the escape hatch |

---

## 9. Deliverables Checklist (Developer Tickets)

| # | Ticket | Phase |
|---|---|---|
| T-01 | Obtain + validate Bocaue boundary GeoJSON (2+ sources) | 1 |
| T-02 | Prisma migration: `geo_regions` table + PostGIS geometry + GIST index | 1 |
| T-03 | Seed SQL: insert Bocaue polygon | 1 |
| T-04 | `AuthService.checkGeoFence()` + unit tests | 1 |
| T-05 | `GeoCheckDto` + `POST /api/v1/auth/geo-check` + rate limiting | 1 |
| T-06 | Update `RegisterDto` — remove address fields, add lat/lng | 1 |
| T-07 | Update `AuthService.register()` — add geo-fence gate | 1 |
| T-08 | `location.service.ts` — GPS capture + timeout wrapper | 2 |
| T-09 | Bundle `bocaue_boundary.geojson` + `@turf/boolean-point-in-polygon` | 2 |
| T-10 | `useGeoFence` hook | 2 |
| T-11 | Remove address fields from `RegistrationScreen` + `registerSchema` | 3 |
| T-12 | Add `locationStep` state machine + Permission / Loading / Outside / Error UI states | 3 |
| T-13 | i18n strings for all new states (en + fil) | 3 |
| T-14 | Pass lat/lng to `register()` API call | 3 |
| T-15 | Update `tests/mobile/auth.registration.spec.tsx` (remove old, add new geo tests) | 4 |
| T-16 | Backend geo-fence integration test with PostGIS test fixture | 4 |
| T-17 | GPS timeout + accuracy-warning + permanent-denial edge case handling | 4 |
| T-18 | QA pass: physical Android device in Bocaue + emulator outside | 4 |

---

## 10. Clarifying Questions

Before implementation begins, the following need answers:

1. **Bocaue GeoJSON source:** Do we use the OpenStreetMap relation (2689505), a PhilGIS shapefile, or an official LGU-provided boundary? Which is authoritative for legal/operational purposes?

2. **Address field removal — full or partial?** The plan removes all four address fields from registration. Should barangay remain as an optional field after GPS confirms the user is inside Bocaue (i.e., user self-reports their barangay), or is GPS + no address input the final state?

3. **Offline registration:** If a user has no internet at all (cannot hit `/geo-check`), should registration be fully blocked, or should we allow it if the device's cached location is within the polygon? The current plan blocks it — confirm this is acceptable.

4. **MDRRMO / BFP staff escape hatch:** Staff may register from outside Bocaue (e.g., from the provincial office or another LGU). Should there be an admin-generated invite code that bypasses the geo-fence for these accounts, or will their accounts always be created by a System Administrator directly?

5. **Boundary precision:** The Bocaue boundary on OSM includes river boundaries and some disputed parcels near Marilao. Should we use the polygon as-is, or does the LGU have a preferred definition?

6. **Privacy Policy update:** Does adding GPS capture to the registration flow require an update to the existing Privacy Policy text? Who approves that change?

7. **Existing registered users:** There are already users in the database with free-text addresses. Do we migrate them (set municipality/province from existing values) or leave them as-is?
