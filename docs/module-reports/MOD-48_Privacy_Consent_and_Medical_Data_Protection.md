# MOD-48 — Privacy, Consent and Medical Data Protection

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-48 |
| Version | 1.0 |
| Module Name | Privacy, Consent and Medical Data Protection |
| Module Cluster | Cluster H — Governance and Compliance |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Protects personal, location, and medical data for its entire lifecycle inside AGAP — classifying what's sensitive, requiring explicit consent before medical data can even exist, enforcing least-privilege access, and logging who accessed what.

**Purpose**
Earn the trust that comes with holding medical information, without claiming to be a certified legal-compliance product — this is a technical protection layer, not a law firm's sign-off.

**Tasks Performed**
1. Requires a separate, explicit consent record — granted or withdrawn, with a timestamp — before any medical profile can exist.
2. Encrypts every medical value at rest with AES-256-GCM, so the database cannot be read without the application's key.
3. Logs access to sensitive data and exposes that access log to the citizen on their own Privacy screen.
4. Lets the citizen export their own medical and personal data in readable form.
5. Immediately re-locks the Medical Profile screen (MOD-03) if the citizen withdraws consent.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A caller's medical history, collected verbally over phone or radio | A grant/withdraw consent action with a timestamp, recorded separately from the rest of account registration |
| 2 | Whatever gets written into a logbook anyone with physical access can read | Medical profile field values, encrypted with AES-256-GCM before being written to PostgreSQL |
| 3 | No record of who looked at what or when | A citizen's request to view their access log or export their own data |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Verbal collection of medical details over phone or radio | `backend/src/consent` service recording a Granted/Withdrawn consent record with timestamp, separate from account registration |
| 2 | A physical logbook readable by anyone with access to it | `backend/src/privacy` service providing the access log and data export |
| 3 | No encryption, no access log, no consent step at all | AES-256-GCM encryption of medical profile values (verifiable in Prisma Studio as `v1.`-prefixed ciphertext) |
| 4 | — | Mobile Privacy screen, `mobile/app/profile/privacy.tsx` (Medical Data Consent toggle, Access Log, Export My Data) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | Sensitive details (a caller's medical history, a patient's condition) are collected verbally, over the phone or radio. |
| 2 | They're written into a logbook that anyone with physical access can read. |
| 3 | There is no record of who looked at what or when, and no consent step at all. |
| 4 | If a citizen wanted to know who had seen their information, there would be no way to answer that. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A physically unsecured logbook entry readable by anyone with access |
| 2 | No access log and no answer to "who has seen my information" |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | Before any medical data is accepted, the backend requires a separate, explicit consent record, granted or withdrawn, with a timestamp. | Validation |
| 2 | Every medical value saved is classified and, for the medical profile, encrypted at rest with AES-256-GCM. | Processing |
| 3 | Access to sensitive data is logged. | Database |
| 4 | The citizen opens their own Privacy screen and views the access log or exports their own data. | User Action |
| 5 | If the citizen withdraws consent, the Medical Profile screen (MOD-03) locks again immediately. | Validation |
| 6 | Consequential actions are written to the audit trail. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A timestamped consent record (granted/withdrawn) separate from account registration |
| 2 | Encrypted-at-rest medical values (`v1.`-prefixed ciphertext in the database) |
| 3 | A citizen-visible access log and self-service data export |

---

## Owner notes (not part of the report)

**Test before signing:**
1. On the phone, sign in as `citizen@demo.agap`, go to Profile → Privacy, and show the Medical Data Consent toggle, the Access Log, and Export My Data.
2. Open Prisma Studio and show a row in `medical_profiles` where every value starts with `v1.` (ciphertext), next to the same profile shown in readable form on the app.
3. Withdraw consent and confirm the Medical Profile screen (MOD-03) locks again immediately.

**Do not claim:**
- Legal compliance certification.
- Guaranteed deletion across every backup copy, or automatic consent propagation to every system that might touch the data.
