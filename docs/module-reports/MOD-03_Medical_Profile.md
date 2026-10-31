# MOD-03 — Medical Profile

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-03 |
| Version | 1.0 |
| Module Name | Medical Profile |
| Module Cluster | Cluster A — User and Identity |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets a signed-in citizen record optional medical information in the AGAP app: blood type, allergies, medical conditions, current medications, disabilities and notes for responders. The profile can be created only after the citizen gives separate medical data consent, and every field is optional.

**Purpose**
Have important medical facts written down ahead of time, with the citizen's explicit consent, so they don't have to be asked for during an emergency. A missing medical profile never blocks an emergency report or a dispatch.

**Tasks Performed**
1. Records and withdraws the citizen's separate medical data consent.
2. Blocks creating a medical profile until consent is granted.
3. Saves blood type and lists of allergies, conditions, medications and disabilities, plus notes for responders.
4. Shows the saved profile and lets the citizen edit it, recording the review date.
5. Validates entry lengths and list sizes before saving.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Patient's or companion's verbal answers about allergies and conditions | Medical data consent (grant or withdraw) |
| 2 | Medicine bottles or prescriptions found on scene | Blood type |
| 3 | Hospital records or medical ID cards, if carried | Allergies |
| 4 | Responder's on-scene observations | Medical conditions |
| 5 | | Current medications |
| 6 | | Disabilities |
| 7 | | Notes for responders |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Verbal interview at the scene | AGAP Citizen mobile app (Expo, React Native, Expo Router) |
| 2 | Paper patient-care or assessment form | TanStack Query (loading and saving the profile) |
| 3 | Personal records carried by the patient (prescriptions, ID cards) | NestJS REST API (`/v1/consent`, `/v1/medical-profiles`) with input validation |
| 4 | Telephone (calling relatives for medical history) | JWT sign-in check (each citizen can reach only their own profile) |
| 5 | | PostgreSQL (`consent_records`, `medical_profiles` tables) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | Responders reach the patient with no advance information about their health. |
| 2 | They ask the patient, if conscious, or companions about allergies, conditions and medications. |
| 3 | They look for medicine bottles, prescriptions or ID cards on the patient. |
| 4 | If no one knows, staff try to call relatives for the medical history. |
| 5 | What is learned is written on the paper patient-care form. |
| 6 | The information is passed on verbally to the hospital at handover. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Handwritten medical notes on the patient-care form |
| 2 | Verbal medical history passed to the hospital |
| 3 | Missing or incomplete medical information when the patient can't answer |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The signed-in citizen opens Profile, then Medical Profile. The app asks the backend whether medical data consent has been granted. | User Action |
| 2 | Without consent, the screen explains the purpose and shows Manage Consent, which opens Privacy. The citizen grants medical data consent there. | User Action |
| 3 | The backend saves a consent record with status Granted and the time it was granted. | Database |
| 4 | Back on Medical Profile, the citizen picks a blood type (A+, A−, B+, B−, AB+, AB−, O+, O−, another value or unknown) and adds allergies, conditions, medications, disabilities and notes. | User Action |
| 5 | The backend validates the entries: blood type up to 5 characters, at most 20 items per list and 60 characters per item, notes up to 500 characters. Blank entries are trimmed out. | Validation |
| 6 | The backend refuses to create a profile if no granted consent exists, or if a profile already exists. | Validation |
| 7 | The backend encrypts each medical entry (AES-256-GCM, bound to the citizen) and saves the profile linked to the citizen and to the consent record. Only encrypted values are stored in the database. | Database |
| 8 | The backend decrypts the profile for its owner, and the app shows it by section, with a count per list and allergies highlighted. | Processing |
| 9 | To edit, the citizen changes any field and saves. The backend re-encrypts the profile, updates it and records the review date. | Database |
| 10 | The citizen can withdraw consent in Privacy after a confirmation. The backend marks the consent Withdrawn, and the medical screen locks again. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Medical data consent record (Granted or Withdrawn, with timestamps) |
| 2 | Saved medical profile, encrypted at rest, linked to the citizen and to their consent |
| 3 | Medical profile summary shown to the citizen by section |
| 4 | Updated profile with the date it was last reviewed |
| 5 | Validation and refusal messages (no consent, entry too long, profile already exists) |

---

## Owner notes (not part of the report)

**Test before signing:**
1. On a new account, open Medical Profile; it should be locked.
2. Grant consent in Privacy, then create a profile with a blood type and two allergies.
3. Edit the profile.
4. Withdraw consent and confirm the screen locks.
5. Try a 61-character item and confirm it's rejected.

**Encryption (added 2026-10-23):** every medical value is AES-256-GCM encrypted with `MEDICAL_ENCRYPTION_KEY` before it is saved, and bound to its owner. A screenshot of the `medical_profiles` row (values start with `v1.`) next to the readable app screen shows it. The server needs the key set; without it a profile can't be saved (dispatch is never affected).

**Do not claim:**
- **Responders viewing the profile in an app.** The backend `GET /medical-profiles/:userId` (with an access log) exists, but no web or mobile screen calls it.
- **Deleting the profile from the app.** The backend `DELETE /medical-profiles/me` exists, but no screen uses it.
- **The access log and data export** on the Privacy screen. They belong to MOD-48, not this module.
