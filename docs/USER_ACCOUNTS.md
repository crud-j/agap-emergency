# AGAP — Operational User Accounts (non-citizen)

Seeded staff/operational accounts for the **Operations Center (web)** and **Responder (mobile)** apps.
Citizen/guest reporter accounts are intentionally excluded.

- **Source of truth:** `backend/prisma/seed/seed.ts` — (re)create with `cd backend && pnpm prisma db seed`.
- **Operator context:** Bocaue MDRRMO / LGU Operations Center, Bocaue, Bulacan.
- **Roles** match the `user_role` enum and MOD-47 (RBAC).

> ⚠️ **Development credentials only.** Change every password before any non-dev deployment. Never commit real secrets (`CLAUDE.md`).

---

## Credentials at a glance

- **Shared dev password (all seeded operational accounts except the admin):** `AgapDev2026!`
- **System Administrator password:** value of `INITIAL_ADMIN_PASSWORD` in `.env` (placeholder default: `ChangeThisPasswordImmediately!`).
- **Login:** email + password. Web → Operations Center at `http://localhost:3001/login`. Mobile → responders sign in with email + password (reuses the same auth; no separate rescuer login).

| Role | Name | Email (login) | Phone | Password | Org | Logs in to |
|---|---|---|---|---|---|---|
| System Administrator | System Administrator | `admin@agap.local` *(= `INITIAL_ADMIN_EMAIL`)* | — | `INITIAL_ADMIN_PASSWORD` | Platform | Web (Admin) |
| Dispatcher | Juan dela Cruz | `dispatcher1@mdrrmo.bocaue.gov.ph` | +639171234001 | `AgapDev2026!` | MDRRMO Bocaue | Web (Operations Center) |
| Dispatcher | Maria Santos | `dispatcher2@mdrrmo.bocaue.gov.ph` | +639171234002 | `AgapDev2026!` | MDRRMO Bocaue | Web (Operations Center) |
| Supervisor | Roberto Reyes | `supervisor@mdrrmo.bocaue.gov.ph` | +639171234003 | `AgapDev2026!` | MDRRMO Bocaue | Web (Operations Center) |
| Responder | Jose Mendoza | `responder1@mdrrmo.bocaue.gov.ph` | +639171234004 | `AgapDev2026!` | MDRRMO Bocaue | Mobile (Responder) |
| Responder | Ana Garcia | `responder2@mdrrmo.bocaue.gov.ph` | +639171234005 | `AgapDev2026!` | MDRRMO Bocaue | Mobile (Responder) |
| Responder | Carlos Bautista | `responder3@bfp.bocaue.gov.ph` | +639171234006 | `AgapDev2026!` | BFP Bocaue | Mobile (Responder) |
| Hospital User | Dr. Luz Aquino | `receiving@bocauehospital.gov.ph` | +639171234007 | `AgapDev2026!` | Bocaue General Hospital | Web (Hospital Portal) |
| Announcements Publisher | LGU Information Officer | `announcements@lgu.bocaue.gov.ph` | +639171234008 | `AgapDev2026!` | LGU | Web (Announcements Console) |

---

## Accounts by role

### 🛡️ System Administrator
- **Account:** `admin@agap.local` (overridable via `INITIAL_ADMIN_EMAIL`).
- **Password:** `INITIAL_ADMIN_PASSWORD` (env).
- **Authority (MOD-47/49):** platform-wide — manage accounts, roles, system config, health; global oversight.
- **Surface:** Operations Center → Administration.

### 🧭 Dispatcher (Operations Center staff)
- **Accounts:** `dispatcher1@mdrrmo.bocaue.gov.ph` (Juan dela Cruz), `dispatcher2@mdrrmo.bocaue.gov.ph` (Maria Santos).
- **Authority:** receive, acknowledge, triage/assess, validate, **authorize dispatch**, escalate, monitor — within assigned authority. Cannot close? (closure is dispatcher/supervisor per lifecycle). Cannot perform responder/field-only actions.
- **Surface:** Operations Center → Dispatch, Command Queue, Map.

### 👮 Supervisor / Incident Commander
- **Account:** `supervisor@mdrrmo.bocaue.gov.ph` (Roberto Reyes).
- **Authority:** everything a dispatcher can, plus review/approve/override, receive escalations, authorize special actions (ICS activation, multi-agency, mutual-aid approval, surge mode).
- **Surface:** Operations Center (full ops authority).

### 🚑 Responder / Ambulance Crew (Rescuer)
- **Accounts:** `responder1@mdrrmo.bocaue.gov.ph` (Jose Mendoza, MDRRMO), `responder2@mdrrmo.bocaue.gov.ph` (Ana Garcia, MDRRMO), `responder3@bfp.bocaue.gov.ph` (Carlos Bautista, BFP).
- **Authority (MOD-32):** receive assignment, accept/decline, update status (En Route → On Scene → Transporting), share live location, on-scene assessment, hospital referral. Cannot acknowledge or close an incident.
- **Surface:** Mobile app (Responder flow) — routed to `/responder/assignments` after login.
- **Demo note:** `responder1` is pre-crewed on unit **ALPHA-1 (MDRRMO Ambulance 1)** for incident `INC-2026-DEMO01` after seeding, so the dispatch → tracking flow is testable immediately.

### 🏥 Hospital / Receiving Facility User
- **Account:** `receiving@bocauehospital.gov.ph` (Dr. Luz Aquino).
- **Authority (MOD-38):** view inbound referrals, acknowledge/coordinate receiving, update receiving status — facility-scoped.
- **Surface:** Web (Hospital Portal).

### 📢 Announcements Publisher
- **Account:** `announcements@lgu.bocaue.gov.ph` (LGU Information Officer).
- **Authority (MOD-53):** compose, schedule, publish, archive public announcements. **One-way broadcast only — not an emergency dispatch channel** (Rule 16).
- **Surface:** Web (Announcements Console).

---

## Roles with no seeded account

| Role | Why no seed account | How to create |
|---|---|---|
| **Organization Administrator** (`ORG_ADMINISTRATOR`) | Org-scoped admin of users/resources/config; create per partner org as needed | Admin → Administration (users) or org members endpoint |
| **Bystander** (`BYSTANDER`) | Guest reporter — submits an emergency with **no account** (Rule 14) | n/a (guest path) |
| **Citizen** (`CITIZEN`) | Excluded here by request | Self-registration in the mobile app |

---

## Organizations (seeded)

| Organization | Short name | Type | Members |
|---|---|---|---|
| Bocaue Municipal DRRM Office | MDRRMO Bocaue | MDRRMO | dispatcher1, dispatcher2, supervisor, responder1, responder2 |
| Bureau of Fire Protection — Bocaue | BFP Bocaue | BFP | responder3 |
| Bocaue General Hospital | BGH | HOSPITAL | hospital user |

---

## Notes
- All accounts above are created with `is_email_verified = true`, so they can log in immediately after seeding.
- Passwords are bcrypt-hashed at seed time; the plaintext dev password is `AgapDev2026!` (printed by the seed summary).
- RBAC is enforced server-side in order: identity → role → organization → ownership → permission (`CLAUDE.md` Security Model). The accounts above only *have* a login; actual capabilities are gated by these checks.
