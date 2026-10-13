# AGAP WS-7 — Remaining Items Implementation Plan

**Created:** 2026-10-08  
**Based on:** P20 Full-System Verification (P20 session, same date)  
**Status:** Ready for implementation  

---

## Context

Five items remain after the P20 verification pass. Two are 🔴 stub pages (no functionality at all); three are 🟡 partial (page exists but missing a specific feature). All backend services, endpoints, and frontend hooks for these items already exist — only UI wiring is missing.

---

## Item Inventory

| # | Priority | Module | Description | File(s) to touch |
|---|----------|--------|-------------|-----------------|
| WS-7.1 | 🔴 | MOD-38/39 | Hospitals OPS page — full implementation | `frontend/app/(ops)/hospitals/page.tsx` |
| WS-7.2 | 🔴 | MOD-41 | Escalations OPS page — full implementation | `frontend/app/(ops)/operations/escalations/page.tsx` |
| WS-7.3 | 🟡 | MOD-52 | Surge triage WS push | `shared/src/events/incident.events.ts`, `backend/src/disaster-mode/disaster-mode.service.ts`, `frontend/providers/socket-provider.tsx` |
| WS-7.4 | 🟡 | MOD-51 | Risk area management dialog (SYS_ADMIN) | `frontend/features/risk/api.ts`, `frontend/features/risk/hooks.ts`, `frontend/app/(ops)/operations/risk/page.tsx` |
| WS-7.5 | 🟡 | MOD-40 | Transport tab in IncidentDetailDrawer | `frontend/features/dispatch/api.ts`, `frontend/features/dispatch/hooks.ts`, `frontend/components/incidents/IncidentDetailDrawer.tsx` |

Suggested order: WS-7.1 → WS-7.2 → WS-7.3 → WS-7.4 → WS-7.5. The two 🔴 items are independent pages; the three 🟡 items each touch a different surface.

---

## WS-7.1 — MOD-38/39 Hospitals OPS Page

### Current state

`frontend/app/(ops)/hospitals/page.tsx` is a 10-line stub with no data, no hooks, no interactions.

### All hooks exist — no new backend work needed

| Hook | Source | Notes |
|------|--------|-------|
| `useHospitals(active?)` | `features/hospitals/hooks.ts:14` | Returns `PaginatedResult<Hospital>` |
| `useFacilities()` | `features/hospitals/hooks.ts:31` | Returns `PaginatedResult<Facility>` |
| `useHospitalReferrals(params?)` | `features/hospitals/hooks.ts:48` | Params: `incidentId`, `hospitalId`, `status` |
| `useAcceptReferral()` | `features/hospitals/hooks.ts:60` | Mutates, invalidates `hospital-referrals` |
| `useDivertReferral()` | `features/hospitals/hooks.ts:67` | Mutates `{ referralId, reason }`, invalidates `hospital-referrals` |

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Hospital Coordination   [Referrals tab] [Registry tab]          │
│                                                                  │
│  ┌─── Referrals (default tab) ─────────────────────────────────┐ │
│  │  Filter: [All ▾] [PENDING] [ACCEPTED] [DIVERTED]             │ │
│  │                                                               │ │
│  │  DataTable: Ref | Hospital | Status | Referred | Notes | Act │ │
│  │  ────────────────────────────────────────────────────────── │ │
│  │  INC-2026-001  Bocaue MCH  PENDING  5 min ago  —  [Accept▸] │ │
│  │                                                  [Divert▸]  │ │
│  └───────────────────────────────────────────────────────────── ┘ │
│                                                                  │
│  ┌─── Registry tab ────────────────────────────────────────────┐ │
│  │  Two sub-lists (Hospitals / Facilities) in Card rows         │ │
│  │  Name · Address · Phone · Emergency Contact · Active badge   │ │
│  └───────────────────────────────────────────────────────────── ┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Implementation notes

- Use the same `Card`, `DataTable`, `Badge`, `Button`, `Dialog`, `EmptyState`, `Skeleton` components from `@/components/ui` (same pattern as `audit/page.tsx`).
- Divert requires a reason — open a small Dialog with a `<textarea>` (required), then call `divertReferral.mutate({ referralId, reason })`.
- Referral status variants: `PENDING` → `amber`, `ACCEPTED` → `green`, `DIVERTED` → `default`.
- Active badge on hospital/facility rows: `is_active ? 'green' : 'default'`.
- Tab state: `useState<'referrals' | 'registry'>('referrals')`.
- No role gate needed — all OPS staff can view hospital coordination.

### Acceptance criteria

- [ ] Hospital referrals board renders from `/hospitals/referrals`
- [ ] Status filter tabs work (pass `status` param to `useHospitalReferrals`)
- [ ] Accept button calls `useAcceptReferral` — row status updates via cache invalidation
- [ ] Divert button opens dialog, requires reason, calls `useDivertReferral`
- [ ] Registry tab lists hospitals (`/hospitals`) and facilities (`/facilities`)
- [ ] Loading/error/empty states on all data sections

---

## WS-7.2 — MOD-41 Escalations OPS Page

### Current state

`frontend/app/(ops)/operations/escalations/page.tsx` is an 8-line stub.

### All hooks exist — no new backend work needed

| Hook | Source | Notes |
|------|--------|-------|
| `useEscalations(params?)` | `features/escalations/hooks.ts:12` | Params: `status`, `incidentId`, `page`, `perPage`. `staleTime: 15_000` |
| `useAcknowledgeEscalation()` | `features/escalations/hooks.ts:28` | `mutationFn: (id: string)` |
| `useResolveEscalation()` | `features/escalations/hooks.ts:39` | `mutationFn: ({ id, resolution? })` |

The WS event `escalation.created` is already handled in `socket-provider.tsx` — it calls `qc.invalidateQueries({ queryKey: ['escalations'] })`. The board therefore auto-refreshes when a new escalation fires.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Escalations   [OPEN] [ACKNOWLEDGED] [RESOLVED]   (status tabs)  │
│                                                                  │
│  DataTable: Incident | Type | Reason | Age | Status | Actions   │
│  ────────────────────────────────────────────────────────────── │
│  INC-2026-001  SLA_BREACH  No dispatch 12m+  OPEN  [Ack] [Res] │
│  INC-2026-004  ESCALATED   Severity↑   3m    OPEN  [Ack]        │
└──────────────────────────────────────────────────────────────────┘
```

### Key type — `Escalation` from `features/escalations/api.ts`

```typescript
{
  id, incident_id, escalation_type, status, reason,
  created_at, acknowledged_at, resolved_at, created_by,
  incident?: { id, public_reference, category, priority }
}
```

### Implementation notes

- Status tabs drive the `status` filter: `useEscalations({ status: activeTab })` where `activeTab ∈ { undefined, 'OPEN', 'ACKNOWLEDGED', 'RESOLVED' }`.
- "Acknowledge" only available when `status === 'OPEN'`.
- "Resolve" only available when `status === 'OPEN'` or `'ACKNOWLEDGED'`. Open a Dialog with optional resolution note textarea.
- "Age" column: `timeAgo(escalation.created_at)` (import from `@/lib/incident-format`).
- Type display: format `escalation_type` with `labelCase()` (replace `_` with space, title-case).
- Incident link: `public_reference` should be a `<Link href={/operations/incidents?id=${incident_id}}>` if incident is included in payload; otherwise render `incident_id.slice(0,8)`.
- Priority badge on incident: `<PriorityBadge priority={escalation.incident?.priority} />` (import from `@/components/ui`).
- No role gate — all OPS staff can view escalations.

### Acceptance criteria

- [ ] Escalations list renders from `/escalations`
- [ ] Status tabs filter by `status` param
- [ ] Acknowledge mutation closes the action and refreshes list
- [ ] Resolve mutation with optional note closes and refreshes list
- [ ] WS live update: new escalation.created fires → row appears without refresh
- [ ] Empty state shown when no escalations match filter
- [ ] Loading/error states handled

---

## WS-7.3 — MOD-52 Surge Triage WS Push

### Current state

`DisasterModeService.createTriageTag()` writes to `triage_tags` table but emits no WebSocket event. The surge page polls via `useTriageTags()` which has `refetchInterval: 60_000` as fallback. Adding a push event reduces latency to <1s during a mass-casualty event.

### Decision: implement Option B (WS push)

~30 lines across 3 files; all infrastructure is in place. The `@Global()` `RealtimeModule` is already injected everywhere — `DisasterModeService` just needs it added to its constructor.

### Step 1 — Add event constant to shared

**File:** `shared/src/events/incident.events.ts`

Add to `INCIDENT_EVENTS`:

```typescript
TRIAGE_CREATED: 'triage.created',
```

Add payload type at end of file:

```typescript
/** MOD-52 — START triage tag created during mass-casualty surge. */
export interface TriageCreatedPayload {
  tagId: string;
  surgeId: string;
  triageColor: string;
  taggedAt: string;
}
```

### Step 2 — Emit from service

**File:** `backend/src/disaster-mode/disaster-mode.service.ts`

1. Add `RealtimeService` to imports and constructor:

```typescript
import { RealtimeService } from '../realtime/realtime.service';

constructor(
  private readonly prisma: PrismaService,
  private readonly realtime: RealtimeService,   // ← add
) {}
```

2. After `this.prisma.triage_tags.create(...)` in `createTriageTag()`:

```typescript
try {
  this.realtime.emit('triage.created', {
    tagId: tag.id,
    surgeId: tag.surge_id,
    triageColor: tag.triage_color,
    taggedAt: tag.tagged_at.toISOString(),
  });
} catch { /* WS failure never affects DB write */ }
```

3. Verify `DisasterModeModule` imports `RealtimeModule` (it's `@Global()` so usually available automatically, but confirm in `disaster-mode.module.ts`).

### Step 3 — Handle in socket-provider

**File:** `frontend/providers/socket-provider.tsx`

Add after the existing escalation handler:

```typescript
const offTriage = onIncidentEvent<TriageCreatedPayload>(
  'triage.created',
  () => {
    qc.invalidateQueries({ queryKey: ['triage-tags'] });
  },
);
```

Return `offTriage` in the cleanup array.

Also add `TriageCreatedPayload` to the import from `@agap/shared`.

### Acceptance criteria

- [ ] `INCIDENT_EVENTS.TRIAGE_CREATED` exported from shared
- [ ] `DisasterModeService.createTriageTag` emits `triage.created` after DB write
- [ ] socket-provider invalidates `triage-tags` on `triage.created`
- [ ] Surge page triage table refreshes in <2s after a tag is created (no manual refresh)
- [ ] Backend typecheck (`npx tsc --noEmit`) passes after service change
- [ ] Shared build (`pnpm --filter @agap/shared build`) passes

---

## WS-7.4 — MOD-51 Risk Area Management Dialog

### Current state

`frontend/app/(ops)/operations/risk/page.tsx` shows the risk areas list read-only. `features/risk/api.ts` has only GET functions. The backend already exposes:

- `POST /risk-intelligence/areas` — `SYSTEM_ADMINISTRATOR` only
- `PATCH /risk-intelligence/areas/:id` — `SYSTEM_ADMINISTRATOR` only
- `DELETE /risk-intelligence/areas/:id` — `SYSTEM_ADMINISTRATOR` only

### Step 1 — Add mutations to `features/risk/api.ts`

```typescript
export interface CreateRiskAreaBody {
  name: string;
  riskType: string;
  riskLevel?: string;
  barangay?: string;
  floodThresholdMeters?: number;
  description?: string;
}

export interface UpdateRiskAreaBody {
  name?: string;
  riskLevel?: string;
  barangay?: string;
  floodThresholdMeters?: number;
  description?: string;
  isActive?: boolean;
}

export function createRiskArea(body: CreateRiskAreaBody): Promise<RiskArea> {
  return api.post('/risk-intelligence/areas', body, getToken());
}

export function updateRiskArea(id: string, body: UpdateRiskAreaBody): Promise<RiskArea> {
  return api.patch(`/risk-intelligence/areas/${id}`, body, getToken());
}

export function deactivateRiskArea(id: string): Promise<RiskArea> {
  return api.patch(`/risk-intelligence/areas/${id}`, { isActive: false }, getToken());
}
```

### Step 2 — Add mutation hooks to `features/risk/hooks.ts`

```typescript
export function useCreateRiskArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRiskAreaBody) => createRiskArea(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-areas'] }),
  });
}

export function useUpdateRiskArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRiskAreaBody }) => updateRiskArea(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-areas'] }),
  });
}

export function useDeactivateRiskArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateRiskArea(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-areas'] }),
  });
}
```

### Step 3 — Add dialog to risk page

**File:** `frontend/app/(ops)/operations/risk/page.tsx`

- Import `useAuthUser`, `hasRole` from `@/lib/use-auth`
- Import the new hooks from `@/features/risk/hooks`
- Show "Manage Areas" button in page header only when `hasRole(user, 'SYSTEM_ADMINISTRATOR')`
- Dialog form fields:
  - `name` (text, required)
  - `riskType` (select: `FLOOD_ZONE`, `INDUSTRIAL`, `TRAFFIC`, `STRUCTURAL`, `OTHER`)
  - `riskLevel` (select: `LOW`, `MODERATE`, `HIGH`, `EXTREME`, default `MODERATE`)
  - `barangay` (select from `BOCAUE_BARANGAYS` constant already in the page, optional)
  - `floodThresholdMeters` (number input, optional — only relevant for flood zones)
  - `description` (textarea, optional)
- Mode: dialog can be `'create'` or `{ edit: RiskArea }` — share same form
- Deactivate: destructive button on existing active areas (with confirmation)

### Acceptance criteria

- [ ] "Manage Areas" button visible only to `SYSTEM_ADMINISTRATOR` role
- [ ] Create dialog submits to `POST /risk-intelligence/areas`
- [ ] Edit dialog submits to `PATCH /risk-intelligence/areas/:id`
- [ ] Deactivate sets `isActive: false` via PATCH
- [ ] Risk areas list refreshes after each mutation (via query invalidation)
- [ ] TypeScript: `exactOptionalPropertyTypes` safe (use conditional spread for optional fields)

---

## WS-7.5 — MOD-40 Transport Tab in IncidentDetailDrawer

### Current state

`IncidentDetailDrawer.tsx` shows a "Response" section (dispatch status + ETA label) but does not surface transport records. `IncidentDetail.dispatches` only carries `{ id, status, resource_id }` — no transport data.

Backend `DispatchService.getTransport(dispatchId)` exposes: `GET /dispatch/:id/transport` → `TransportRecord` (from `prisma.transportRecord`).

### Step 1 — Add fetcher to `features/dispatch/api.ts`

```typescript
export interface TransportRecord {
  id: string;
  dispatch_id: string;
  incident_id: string;
  destination_id: string | null;
  patient_id: string | null;
  transport_started_at: string;
  arrived_at: string | null;
  handover_completed_at: string | null;
  destination_changed: boolean;
  change_reason: string | null;
}

export function fetchTransportByDispatch(dispatchId: string): Promise<TransportRecord> {
  return api.get(`/dispatch/${dispatchId}/transport`, getToken());
}
```

### Step 2 — Add hook to `features/dispatch/hooks.ts`

```typescript
export function useTransport(dispatchId: string | null) {
  return useQuery({
    queryKey: ['transport', dispatchId],
    queryFn: () => fetchTransportByDispatch(dispatchId!),
    enabled: !!dispatchId,
    staleTime: 30_000,
  });
}
```

### Step 3 — Add Transport section to `IncidentDetailDrawer.tsx`

In `IncidentDetailBody`, after the existing `<Section icon={Activity} title="Response">` block:

```tsx
{latestDispatch && <TransportSection dispatchId={latestDispatch.id} />}
```

New component (same file):

```tsx
function TransportSection({ dispatchId }: { dispatchId: string }): JSX.Element | null {
  const { data: transport, isLoading } = useTransport(dispatchId);
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!transport) return null;

  return (
    <Section icon={Truck} title="Transport">
      <div className="rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface/50 p-3 space-y-1.5">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-agap-textMid tabular-nums">
          <span><span className="text-agap-textSub">Started</span> {fmtTransportTs(transport.transport_started_at)}</span>
          {transport.arrived_at && (
            <span><span className="text-agap-textSub">Arrived</span> {fmtTransportTs(transport.arrived_at)}</span>
          )}
          {transport.handover_completed_at && (
            <span><span className="text-agap-textSub">Handover</span> {fmtTransportTs(transport.handover_completed_at)}</span>
          )}
        </div>
        {transport.destination_changed && transport.change_reason && (
          <p className="text-xs text-agap-amber">
            Destination changed · {transport.change_reason}
          </p>
        )}
      </div>
    </Section>
  );
}
```

Where `fmtTransportTs(iso: string)` is a local helper formatting the ISO string to `"Oct 8, 14:32"` (same pattern as `fmtTs` in surge page).

Add `Truck` to the lucide-react imports at the top of `IncidentDetailDrawer.tsx`.

### Acceptance criteria

- [ ] Transport section appears in drawer for incidents that have an active dispatch
- [ ] Shows `transport_started_at`, `arrived_at` (if set), `handover_completed_at` (if set)
- [ ] Shows change-reason note if destination was diverted
- [ ] Section is absent (returns null) when no transport record exists (404 from backend — not an error state)
- [ ] TypeScript: `useTransport` hook is only called when `latestDispatch` exists

---

## Verification checklist (run after all 5 items)

After implementing all items, run:

```bash
# Backend typecheck (WS-7.3 touches backend)
cd backend && npx tsc --noEmit

# Frontend typecheck (all 5 items touch frontend)
cd frontend && npx tsc --noEmit

# Full test suite
pnpm -r test

# Build (confirms no runtime import errors)
pnpm -r build
```

Expected: all exit 0. `pnpm -r lint` remains red (pre-existing ESLint 9 vs legacy config issue, unrelated — see `memory/project-frontend-lint-broken.md`).

---

## What this does NOT cover

These pre-existing issues are out of scope for WS-7:

- **MOD-04 Accessibility** — BE language preference not in JWT/profile
- **Frontend dashboard** — 911/MDRRMO hotline fallback display
- **Frontend ESLint** — `next lint` crashes (ESLint 9 vs legacy config migration)
- **Mobile** — 4 unused-var / exhaustive-deps lint errors
