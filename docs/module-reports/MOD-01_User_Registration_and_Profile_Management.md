# MOD-01 — User Registration and Profile Management

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-01 |
| Version | 1.0 |
| Module Name | User Registration and Profile Management |
| Module Cluster | Cluster A — User and Identity |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets residents and workers of Bocaue create an AGAP citizen account in the mobile app, verify their mobile number with an SMS code, sign in, and manage their profile and app preferences. Registration is limited to people physically inside Bocaue. Registration is never required to report an emergency, because guest reporting stays available.

**Purpose**
Give every citizen a verified identity and contact number, so that reports, emergency contacts, medical information and incident status can be tied to the right person. Responders and dispatchers then don't have to collect these details by phone during an emergency.

**Tasks Performed**
1. Checks that the registering device is inside the Bocaue boundary.
2. Creates the citizen account with validated details and a securely hashed password.
3. Verifies the mobile number with a one-time SMS code.
4. Signs the citizen in by password, one-time SMS code or passkey, and keeps the session secure.
5. Resets a forgotten password through an SMS code.
6. Shows the profile and saves language, accessibility and map-icon preferences.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Caller's name, given verbally | Full name |
| 2 | Caller's contact number (from caller ID or spoken) | Philippine mobile number |
| 3 | Caller's spoken address and barangay | Email address (optional) |
| 4 | Blank logbook / incident form | Password and password confirmation |
| 5 | Barangay resident records (RBI), kept separately | Device GPS coordinates (for the Bocaue check) |
| 6 | | Agreement to the Terms of Service and Privacy Policy |
| 7 | | 6-digit one-time SMS code (OTP) |
| 8 | | Profile preferences (language, text size, high contrast, reduced motion) and an optional map icon choice (Male, Female or Prefer not to say) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone / mobile phone (MDRRMO hotline) | AGAP Citizen mobile app (Expo, React Native, Expo Router) |
| 2 | Paper logbook and incident forms | Expo Location (device GPS) |
| 3 | Ballpen and filing cabinet | NestJS REST API (`/v1/auth`, `/v1/users`) with input validation |
| 4 | Barangay resident records (paper or spreadsheet) | PostgreSQL with PostGIS (accounts, verification codes, sessions, Bocaue boundary) |
| 5 | | Redis + BullMQ job queue |
| 6 | | Textbee SMS gateway (OTP delivery) |
| 7 | | bcrypt password hashing; JWT access and refresh tokens |
| 8 | | Expo Secure Store (token storage) and passkeys (device fingerprint or face) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | There is no registration. A resident who needs help calls the MDRRMO hotline or goes to the operations center or barangay hall. |
| 2 | The operator asks for the caller's name, contact number and address. |
| 3 | The operator writes the details by hand in the logbook or incident form. |
| 4 | If the number or address is unclear, the operator calls back to confirm it. |
| 5 | The form is filed. The details aren't linked to any earlier call by the same person. |
| 6 | On the next emergency, the same details are asked for and written again. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Handwritten caller details in the logbook or incident form |
| 2 | Call-back confirmation of the caller's number or address |
| 3 | Paper file of past callers, not searchable |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The citizen opens the AGAP app and taps Create Account. The app asks for location permission and reads the device's GPS position. | User Action |
| 2 | The backend checks the coordinates against the Bocaue boundary (PostGIS). Outside Bocaue, registration is blocked with a message; guest emergency reporting stays available. | Validation |
| 3 | The citizen enters full name, mobile number, optional email, password and confirmation, and agrees to the Terms of Service and Privacy Policy. | User Action |
| 4 | The app and backend validate the entries: a Philippine number (09XXXXXXXXX or +639XXXXXXXXX), a valid email, a password of at least 8 characters with uppercase, lowercase, a number and a symbol, and matching passwords. A number or email already registered is rejected. | Validation |
| 5 | The backend hashes the password with bcrypt and saves the account with status Pending Verification, municipality Bocaue, province Bulacan. | Database |
| 6 | The backend creates a 6-digit code valid for 15 minutes, saves it, and queues an SMS to the citizen through Textbee. | Notification |
| 7 | The citizen enters the code. The backend checks that it matches, is unused and hasn't expired. | Validation |
| 8 | The backend marks the phone verified, sets the account to Active, creates a session, and returns access and refresh tokens. The app stores them in Secure Store and opens Home. | Database |
| 9 | On later visits, the citizen signs in with a password, a one-time SMS code (valid 10 minutes), or a saved passkey (fingerprint or face). | User Action |
| 10 | For a forgotten password, the citizen requests a reset code by SMS, enters it with a new password, and the backend saves the new hashed password. | Processing |
| 11 | The Profile screen shows the name and the phone and email with their verification status. The citizen changes language, text size, contrast, motion and the optional map icon (Male, Female or Prefer not to say, used only for the reporter's icon on the responder's map); each change is saved to the account. | Database |
| 12 | When the citizen signs out, the backend revokes the session and the app deletes the stored tokens. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Verified, active citizen account saved in PostgreSQL |
| 2 | SMS one-time code delivered to the citizen's phone |
| 3 | Signed-in session, with tokens stored securely on the device |
| 4 | Saved profile preferences (language, accessibility settings, map icon) |
| 5 | Clear rejection messages (outside Bocaue, number already registered, wrong or expired code) |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Register inside Bocaue, check the OTP, and confirm you land on Home.
2. Try registering with a number that's already used.
3. Try an expired or wrong code.
4. Sign in with a password, then with an SMS code.
5. Reset a password.
6. Change the language and confirm it's kept after signing out and back in.

**In development:** if Textbee isn't configured, the OTP appears in the backend log (`[DEV] Registration OTP …`).

**Do not claim:**
- Editing your name, barangay or address in the app. The backend `PATCH /users/me` accepts them, but no app screen offers it.
- Deleting or deactivating your account from the app. The backend `DELETE /users/me` exists, but no app screen uses it.
