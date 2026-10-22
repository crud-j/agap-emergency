# AGAP — Operational User Accounts (non-citizen)

Seeded staff/operational accounts for the **Operations Center (web)** and **Responder (mobile)** apps.
Citizen/guest reporter accounts are intentionally excluded.

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
| Announcements Publisher | LGU Information Officer (Office of the Mayor) | `announcements@lgu.bocaue.gov.ph` | +639171234008 | `AgapDev2026!` | LGU | Web (Municipal Overview + Announcements) |
| Org Administrator | Elena Villanueva | `orgadmin@mdrrmo.bocaue.gov.ph` | +639171234009 | `AgapDev2026!` | MDRRMO Bocaue | Web (Organization Administration) |

---

## Accounts by role

### 🛡️ System Administrator
- **Account:** `admin@agap.local` (overridable via `INITIAL_ADMIN_EMAIL`).
- **Password:** `INITIAL_ADMIN_PASSWORD` (env).
- **Authority (MOD-47/49):** platform-wide — manage accounts, roles, system config, health. **No operational authority** (no dispatch, triage, escalation or surge); see the [role spec](AGAP_Role_Rules_and_Dashboard_Content.md) §5.
- **Surface:** Operations Center → Dashboard (system health) and the Administration pages (`/administration/users`, `/permissions`, `/barangays`, `/config`).

### 🧭 Dispatcher (Operations Center staff)
- **Accounts:** `dispatcher1@mdrrmo.bocaue.gov.ph` (Juan dela Cruz), `dispatcher2@mdrrmo.bocaue.gov.ph` (Maria Santos).
- **Authority:** receive, acknowledge, triage/assess, validate, **authorize dispatch**, escalate, monitor — within assigned authority. Can close an incident once its resolution is recorded. Cannot perform responder/field-only actions.
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

### 📢 Announcements Publisher — LGU Information Officer (Office of the Mayor)
- **Account:** `announcements@lgu.bocaue.gov.ph` (LGU Information Officer). Posts on the Mayor's behalf; the Mayor has no account (role spec §1).
- **Authority (MOD-53):** compose, schedule, publish, archive public announcements. **One-way broadcast only — not an emergency dispatch channel** (Rule 16). Sees aggregated counts only, never incident details.
- **Surface:** Web (Municipal Overview + Announcements).

### 🏢 Org Administrator
- **Account:** `orgadmin@mdrrmo.bocaue.gov.ph` (Elena Villanueva, MDRRMO Bocaue).
- **Authority:** manage its own organization's members, units and resource requests. No dispatch, triage or incident authority.
- **Surface:** Web (Organization Administration). Its organization pages are being added (role dashboards plan, Phase 6); until then it sees its Dashboard only.

---

## Roles with no seeded account

| Role | Why no seed account | How to create |
|---|---|---|
| **Bystander** (`BYSTANDER`) | Guest reporter — submits an emergency with **no account** (Rule 14) | n/a (guest path) |
| **Citizen** (`CITIZEN`) | Excluded here by request | Self-registration in the mobile app |

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
