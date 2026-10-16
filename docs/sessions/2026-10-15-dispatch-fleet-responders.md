# Session Notes — 2026-10-15
## Dispatch Crew Selection + Fleet Personnel Section

---

## Problems Addressed

1. **Fleet page showed no responder personnel** — the "Fleet — Unit Availability" page only displayed resource units (ambulances, vehicles) but had no section for responder *accounts* (the actual people).
2. **Dispatchers could only assign recommended resource units** — there was no way to select which specific responder accounts get the assignment, so the assignment never appeared on a responder's mobile app.

---

## Root Cause

The backend `GET /api/v1/responders` endpoint returned minimal user data (`id, full_name, phone_number, status`) with no availability status. The frontend `Responder` type also had stale/incorrect fields (`user_id`, `resource_id`, `organization_id`) that didn't match what the API actually returned.

The `createDispatch` body already supported `initialCrewIds?: string[]` — the backend was ready to assign responders, the frontend just never exposed it.

---

## Files Changed

### Backend

| File | Change |
|---|---|
| `backend/src/responders/responders.service.ts` | `findAll` now joins `responder_availability_user` and `organization_memberships`; returns `availability_status`, `availability_changed_at`, `organization` per responder, sorted by name |

### Frontend

| File | Change |
|---|---|
| `frontend/features/responders/api.ts` | `Responder` interface updated to real API shape; `ResponderListParams` cleaned up (removed `status`, `organization_id` which never existed on the backend route) |
| `frontend/features/dispatch/hooks.ts` | `useCreateDispatch` now invalidates `['responders']` query on success so fleet page refreshes |
| `frontend/app/(ops)/operations/fleet/page.tsx` | Added full "Personnel — Responder Availability" section (stat cards, availability filter, responder card grid) below unit grid |
| `frontend/app/(ops)/operations/dispatch/page.tsx` | Added collapsible "Assign crew members" panel inside `RecommendationPanel`; multi-select available responders; `initialCrewIds` passed to `createDispatch` |

---

## How It Works Now

### Fleet page
- Top section: resource units (ambulances, trucks, etc.) — unchanged
- Bottom section: **Personnel — Responder Availability**
  - Stat cards: Total Responders / Available / Off Duty
  - Filter by availability status (AVAILABLE / OFF_DUTY / UNAVAILABLE)
  - Card grid: initials avatar, name, phone, availability badge (green/grey/red), organization
  - The unit search bar also filters responder names

### Dispatch page — crew selection
- In the dispatch panel (when an incident is in ACKNOWLEDGED/ASSESSED/DISPATCH_PENDING state):
  - After selecting a unit (recommended or fallback), a collapsible **"Assign crew members (optional)"** row appears
  - Click it to expand a scrollable list of all `AVAILABLE` responders
  - Multi-select with checkboxes; a green count badge shows how many are selected
  - On "Authorize dispatch", selected responders are passed as `initialCrewIds`
  - Backend locks their `responder_availability` rows and creates `dispatch_crew` records
  - The responder's mobile `GET /api/v1/responders/me/assignments` will now include this dispatch — it shows on their app

---

## Responder Availability Status Enum
```
AVAILABLE   ← can be assigned to a dispatch
OFF_DUTY    ← not working, cannot be assigned
UNAVAILABLE ← blocked (e.g. holding active assignment)
```
The backend blocks assigning OFF_DUTY/UNAVAILABLE responders with a `ConflictException('RESPONDER_NOT_AVAILABLE')`.

---

## Data Flow — Responder Assignment
```
Dispatcher selects unit + crew → createDispatch({ resourceId, initialCrewIds })
  → backend transaction:
      1. Lock responder_availability rows (sorted UUID order, deadlock-safe)
      2. Validate all are AVAILABLE
      3. Create dispatch_crew records
      4. Set resource status = DISPATCHED
      5. Advance incident to DISPATCHED
      6. Emit incidentAssigned WebSocket event (responderId = initialCrewIds[0])
  → Responder sees dispatch in GET /responders/me/assignments
  → Responder can accept/decline/update status (EN_ROUTE, ON_SCENE, etc.)
```

---

## Follow-up Work (Not Done Yet)

- [ ] **Responder mobile app** — verify `GET /api/v1/responders/me/assignments` renders the new assignment on the responder's home screen (MOD-32 / `mobile/app/responder/`)
- [ ] **Push notification to assigned responders** — the `dispatch.service.ts` currently only pushes to the *reporter*. Consider adding a push to each crew member's device token via the notifications queue.
- [ ] **Fleet page — real-time updates** — responder availability changes via WebSocket (`responder.status_changed`) should invalidate the `['responders']` query. Wire up the WS subscription in the fleet page.
- [ ] **Dispatcher can see who is assigned** — the dispatch detail card ("Unit dispatched — tracking live") could list the assigned crew members by name.
- [ ] **Responder availability in dispatch** — if a responder goes off-duty between page load and dispatch, the backend will throw `RESPONDER_NOT_AVAILABLE`. Surface this error more clearly in the crew picker UI.
- [ ] **Fleet page — search also filters by org** — the org filter in the unit section doesn't carry over to the responder section. Could add a shared org filter.

---

## Key Architecture Rules (relevant to this area)

- Dispatch decisions are **never autonomous** — dispatcher selects and confirms (CLAUDE.md rule 8)
- `initialCrewIds` is optional — you can dispatch a unit without naming crew
- A failed push notification must never cancel or delete a dispatch (reliability rule)
- Realtime WS events are best-effort; PostgreSQL is the source of truth

---

## Commands to Run After Picking Up

```bash
# Start backend
cd backend && pnpm start:dev

# Start frontend
cd frontend && pnpm dev

# If schema changed (it didn't this session):
cd backend && pnpm prisma migrate dev
```

---

## Branch / Commit State

All changes are **uncommitted** as of this session. Modified files:
- `backend/src/responders/responders.service.ts`
- `frontend/features/responders/api.ts`
- `frontend/features/dispatch/hooks.ts`
- `frontend/app/(ops)/operations/fleet/page.tsx`
- `frontend/app/(ops)/operations/dispatch/page.tsx`
