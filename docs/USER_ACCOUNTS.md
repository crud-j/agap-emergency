# AGAP — Operational User Accounts (non-citizen)

Seeded staff/operational accounts for the **Operations Center (web)** and **Responder (mobile)** apps.
Citizen and guest reporter accounts are excluded, except the seeded demo citizen ([below](#seeded-citizen-pre-verified)).

- **Source of truth:** `backend/prisma/seed/seed.ts` — (re)create with `cd backend && pnpm prisma db seed`.
- **Operator context:** Bocaue MDRRMO / LGU Operations Center, Bocaue, Bulacan.
- **Roles** match the `user_role` enum and MOD-47 (RBAC).

> ⚠️ **Development credentials only.** Change every password before any non-dev deployment. Never commit real secrets (`CLAUDE.md`).
>
> **First web login:** every seeded web-console account must change its password before opening the console.
> Passwords must be 12–128 characters and must not contain the account holder's name, email local-part,
> `AGAP`, or `Bocaue`, or be among the common-password list. Mobile-only Responder accounts are not forced
> through this web flow.
>
> **Second step (MFA):** web-console staff (System Administrator, Org Administrator, Supervisor, Dispatcher,
> Hospital User, Announcements Publisher) use an authenticator app, a passkey, or a backup code in addition to
> the password. While `AUTH_MFA_ENFORCED=false` it is optional and offered under **Account security**
> (shield icon in the top bar). After a forced password change, a staff member without a factor is guided through
> optional passkey and authenticator setup; either step can be skipped. The authenticator step shows ten one-time
> backup codes and requires confirmation that they were saved. Once `AUTH_MFA_ENFORCED=true`, a staff account with
> no second factor is taken through the separate mandatory enrollment flow at its next sign-in, with no skip.
> Citizens, bystanders and Responders (mobile) never see this step.
>
> **Lockout:** five wrong passwords or codes lock a staff account for 15 minutes (then 30, then 60). A browser the
> user chose to *trust for this shift* (12 h) is exempt from the lock. A System Administrator can use the
> administration unlock action; until supervisor/organization-admin scoping ships, other locked accounts are
> released by waiting or by a System Administrator.

---

## Credentials at a glance

- **Shared dev password (all seeded operational accounts except the admin):** `AgapDev2026!`
- **System Administrator password:** value of `INITIAL_ADMIN_PASSWORD` in `.env` (placeholder default: `ChangeThisPasswordImmediately!`).
- **Login:** email + password. Web → Operations Center at `http://localhost:3001/login`. Mobile → responders sign in with email + password (reuses the same auth; no separate rescuer login).

---

## Website (Operations Center) accounts

These seven accounts can sign in at `http://localhost:3001/login` and open pages there. Checked against the dev
database on **2026-10-22**: it holds exactly these staff accounts, with none added through *Users & Accounts*.
Which pages each role sees comes from `frontend/lib/role-access.ts`; the backend's `@Roles(...)` checks are what
actually enforce access.

| # | Role | Name | Email (login) | Password | Organization | Lands on |
|---|---|---|---|---|---|---|
| 1 | System Administrator | System Administrator | `admin@agap.local` *(= `INITIAL_ADMIN_EMAIL`)* | `INITIAL_ADMIN_PASSWORD` | — (platform) | Dashboard: system health |
| 2 | Supervisor | Roberto Reyes | `supervisor@mdrrmo.bocaue.gov.ph` | `AgapDev2026!` ¹ | MDRRMO Bocaue | Dashboard: Operations Oversight |
| 3 | Dispatcher | Juan dela Cruz | `dispatcher1@mdrrmo.bocaue.gov.ph` | `AgapDev2026!` ¹ | MDRRMO Bocaue | Dispatch |
| 4 | Dispatcher | Maria Santos | `dispatcher2@mdrrmo.bocaue.gov.ph` | `AgapDev2026!` | MDRRMO Bocaue | Dispatch |
| 5 | Announcements Publisher | LGU Information Officer (Office of the Mayor) | `announcements@lgu.bocaue.gov.ph` | `AgapDev2026!` ¹ | — (LGU, no membership) | Dashboard: Municipal Overview |
| 6 | Org Administrator | Elena Villanueva | `orgadmin@mdrrmo.bocaue.gov.ph` | `AgapDev2026!` | MDRRMO Bocaue | Dashboard: organization |
| 7 | Hospital User | Dr. Luz Aquino | `receiving@bocauehospital.gov.ph` | `AgapDev2026!` ¹ | Bocaue General Hospital (BGH) | Hospital Portal (no sidebar) |

¹ **Already changed in the dev database.** These accounts finished the forced first-login password change,
so `AgapDev2026!` no longer works for them. Ask whoever changed it, or have the System Administrator reset it.
Only `dispatcher2` and `orgadmin` still accept `AgapDev2026!`, and they must change it on first sign-in.
Reseeding (`pnpm prisma db seed`) restores the shared password for every account.

All accounts are `PENDING_VERIFICATION` in the database. That is expected (`auth/account-status.ts`): staff can still sign in.

### What each website account sees (sidebar)

| Role | Sidebar pages |
|---|---|
| **System Administrator** | Dashboard · Organizations · Fleet & Units · Hospitals & Facilities · Users & Accounts · Roles & Permissions · Barangay Directory · ID Reviews · Audit Log · Security Events · Integrations · Configuration |
| **Supervisor** | Dashboard · Incident Queue · Live Map · Triage · Dispatch · Escalations · Activity Log · Command / ICS · Multi-Agency · Surge Mode · Fleet & Units · Hospitals & Facilities · Analytics · Risk Map · Approvals · Incident History |
| **Dispatcher** | Dashboard · Incident Queue · Live Map · Triage · Dispatch · Multi-Agency · Fleet & Units · Hospitals & Facilities · Incident History |
| **Announcements Publisher** | Dashboard · Announcements · Publication History (plus *Create announcement*) |
| **Org Administrator** | Dashboard · Organizations · Fleet & Units · Requests · Barangay Directory · ID Reviews (MDRRMO only) |
| **Hospital User** | Hospital Portal only (`/hospitals`) |

### Accounts with no website access

| Role | Accounts | Where they sign in |
|---|---|---|
| Responder | `responder1@mdrrmo.bocaue.gov.ph` (Jose Mendoza), `responder2@mdrrmo.bocaue.gov.ph` (Ana Garcia), `responder3@bfp.bocaue.gov.ph` (Carlos Bautista) | Mobile app only. Signing in on the website works, but every page shows "not available". |
| Citizen / Bystander | Self-registered citizens; guests need no account | Mobile app only |

---

## Mobile (Responder) accounts

| Role | Name | Email (login) | Phone | Password | Org |
|---|---|---|---|---|---|
| Responder | Jose Mendoza | `responder1@mdrrmo.bocaue.gov.ph` | +639171234004 | `AgapDev2026!` | MDRRMO Bocaue |
| Responder | Ana Garcia | `responder2@mdrrmo.bocaue.gov.ph` | +639171234005 | `AgapDev2026!` | MDRRMO Bocaue |
| Responder | Carlos Bautista | `responder3@bfp.bocaue.gov.ph` | +639171234006 | `AgapDev2026!` | BFP Bocaue |

Staff phone numbers (seed): dispatcher1 +639171234001, dispatcher2 +639171234002, supervisor +639171234003,
hospital user +639171234007, publisher +639171234008, org admin +639171234009.

---

## Accounts by role

### 🛡️ System Administrator
- **Account:** `admin@agap.local` (overridable via `INITIAL_ADMIN_EMAIL`).
- **Password:** `INITIAL_ADMIN_PASSWORD` (env).
- **Authority (MOD-47/49):** platform-wide — manage accounts, roles, system config, health. **No operational authority** (no dispatch, triage, escalation or surge); see the [role spec](AGAP_Role_Rules_and_Dashboard_Content.md) §5.
- **Surface:** Operations Center → Dashboard (system health) and the Administration pages (`/administration/users`, `/permissions`, `/barangays`, `/security`, `/integrations`, `/config`), plus the Audit Log. Incident chat is read-only.

### 🧭 Dispatcher (Operations Center staff)
- **Accounts:** `dispatcher1@mdrrmo.bocaue.gov.ph` (Juan dela Cruz), `dispatcher2@mdrrmo.bocaue.gov.phF` (Maria yantos).
- **Authority:** receive, acknowledge, triage/assess, validate, **authorize dispatch**, escalate, monitor — within assigned authority. Can close an incident once its resolution is recorded. Cannot perform responder/field-only actions.
- **Surface:** Operations Center → lands on Dispatch; Incident Queue, Live Map, Triage, Multi-Agency, Incident History.

### 👮 Supervisor / Incident Commander
- **Account:** `supervisor@mdrrmo.bocaue.gov.ph` (Roberto Reyes).
- **Authority:** everything a dispatcher can, plus review/approve/override, receive escalations, authorize special actions (ICS activation, multi-agency, surge mode). Approves or returns CRITICAL advisories when `ANNOUNCEMENT_APPROVAL_REQUIRED=true` (MOD-53), but cannot approve one it submitted itself.
- **Surface:** Operations Center → Operations Oversight dashboard (full ops authority), Escalations, Activity Log, Command / ICS, Surge Mode, Analytics, Risk Map, Approvals.

### 🚑 Responder / Ambulance Crew (Rescuer)
- **Accounts:** `responder1@mdrrmo.bocaue.gov.ph` (Jose Mendoza, MDRRMO), `responder2@mdrrmo.bocaue.gov.ph` (Ana Garcia, MDRRMO), `responder3@bfp.bocaue.gov.ph` (Carlos Bautista, BFP).
- **Authority (MOD-32):** receive assignment, accept/decline, update status (En Route → On Scene → Transporting), share live location, on-scene assessment, hospital referral. Cannot acknowledge or close an incident.
- **Surface:** Mobile app (Responder flow) — routed to `/responder/assignments` after login.
- **Demo note:** `responder1` is pre-crewed on unit **ALPHA-1 (MDRRMO Ambulance 1)** for incident `INC-2026-DEMO01` after seeding, so the dispatch → tracking flow is testable immediately.

### 🏥 Hospital / Receiving Facility User
- **Account:** `receiving@bocauehospital.gov.ph` (Dr. Luz Aquino).
- **Authority (MOD-38):** view inbound referrals, acknowledge/coordinate receiving, update receiving status — facility-scoped.
- **Surface:** Web (Hospital Portal).

### 📢 Announcements Publisher — LGU Information Officer (Office of the Mayor)
- **Account:** `announcements@lgu.bocaue.gov.ph` (LGU Information Officer). Posts on the Mayor's behalf; the Mayor has no account (role spec §1).
- **Authority (MOD-53):** compose, schedule, publish, archive public announcements. With `ANNOUNCEMENT_APPROVAL_REQUIRED=true`, a CRITICAL advisory is *submitted* to an MDRRMO Supervisor instead of published. **One-way broadcast only — not an emergency dispatch channel** (Rule 16). Sees aggregated counts only, never incident details.
- **Surface:** Web (Municipal Overview + Announcements).

### 🏢 Org Administrator
- **Account:** `orgadmin@mdrrmo.bocaue.gov.ph` (Elena Villanueva, MDRRMO Bocaue).
- **Authority:** manage its own organization's members, units and resource requests (own-org is checked on the server). Answers mutual-aid requests. No dispatch, triage, incident or chat authority.
- **Surface:** Web → organization Dashboard, Organizations, Fleet & Units (Registry tab), Requests, Barangay Directory.

---

## Roles with no seeded account

| Role | Why no seed account | How to create |
|---|---|---|
| **Bystander** (`BYSTANDER`) | Guest reporter — submits an emergency with **no account** (Rule 14) | n/a (guest path) |
| **Citizen** (`CITIZEN`) | One demo account only ([below](#seeded-citizen-pre-verified)) | Self-registration in the mobile app, with a PhilHealth ID scan |

---

## Seeded citizen (pre-verified)

| Name | Email (login) | Phone | Password | Signs in on |
|---|---|---|---|---|
| Demo Citizen | `citizen@demo.agap` | +639170000001 | `AgapDev2026!` | Mobile |

New citizens must scan a PhilHealth ID to create an account (`ID_VERIFICATION_REQUIRED=true`). **Seeded citizens skip that:** they are pre-verified, so demos and test flows work without a card.

- The account has `identity_verified_at` and `is_phone_verified` set, and a claimed `AUTO_VERIFIED` scan row with a clearly fake PIN (`00-000000001-0`) and no image. Its profile shows **Verified**, and its reports show **ID verified** on the dispatch console.
- The scan row is written only when `ID_PIN_PEPPER` is set at seed time. Without it, the seed prints a notice and skips the row, and the account is still marked verified.
- It has no consent record, so **Privacy & Data** shows no Withdraw card. Use a registered account to test withdrawal.
- `bystander@demo.agap` is not a citizen, so it can't scan and its reports show no ID label.

---

## Organizations (seeded)

| Organization | Short name | Type | Members |
|---|---|---|---|
| Bocaue Municipal DRRM Office | MDRRMO Bocaue | MDRRMO | dispatcher1, dispatcher2, supervisor, orgadmin, responder1, responder2 |
| Bureau of Fire Protection — Bocaue | BFP Bocaue | BFP | responder3 |
| Bocaue General Hospital | BGH | HOSPITAL | hospital user |

---

## Notes
- All accounts above are created with `is_email_verified = true`, so they can log in immediately after seeding.
- Passwords are bcrypt-hashed at seed time; the plaintext dev password is `AgapDev2026!` (printed by the seed summary).
- Web-console accounts are seeded with `must_change_password = true`; the shared development password is only for the first sign-in and is rejected as a replacement because it contains `AGAP`.
- Responder accounts are not part of the web forced-change rollout, so their mobile login flow remains unchanged.
- Seeded accounts start with **no** second factor. With `AUTH_MFA_ENFORCED=false` they sign in with the password alone until they enroll.
- A staff account that signs in from the mobile app receives “This account signs in on the Operations Center web console” once it has a second factor; mobile MFA is a follow-up.
- Web sign-in starts with the email address and offers passkey sign-in first. Password mode remains available, and
  browsers without WebAuthn support use password mode automatically.
- After a successful web sign-in, this browser may remember up to five account names and email addresses for an
  account picker. It stores no passwords, tokens or MFA data; users can remove entries or use another account.
- Password reset for staff is by a person (Supervisor / System Administrator), not self-service; the web “Forgot password?” page says so.
- RBAC is enforced server-side in order: identity → role → organization → ownership → permission (`CLAUDE.md` Security Model). The accounts above only *have* a login; actual capabilities are gated by these checks.
