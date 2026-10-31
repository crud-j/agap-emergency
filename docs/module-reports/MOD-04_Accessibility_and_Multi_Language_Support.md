# MOD-04 — Accessibility and Multi-Language Support

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-04 |
| Version | 1.0 |
| Module Name | Accessibility and Multi-Language Support |
| Module Cluster | Cluster A — User and Identity |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets the citizen use the AGAP app in English or Filipino and adjust it to their needs: text size, high contrast and reduced motion. The same screen holds the Shake-to-Alert switch. Choices apply across the whole app the moment they are made.

**Purpose**
Make the app usable for elderly residents, people with low vision and people who read Filipino more easily than English, so that language or eyesight never stands between a resident and a request for help.

**Tasks Performed**
1. Shows every screen in English or Filipino (Filipino is the default).
2. Scales text to Small, Medium or Large.
3. Darkens body text to black when High Contrast is on.
4. Turns off decorative animations when Reduced Motion is on.
5. Turns Shake-to-Alert (MOD-07) on or off.
6. Saves the choices on the phone and, for a signed-in citizen, on their account.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Language the caller speaks on the phone | Language (English or Filipino) |
| 2 | Caller's ability to hear and read instructions | Text size (Small, Medium, Large) |
| 3 | Printed advisories and forms in one fixed size | High Contrast (on or off) |
| 4 | | Reduced Motion (on or off) |
| 5 | | Shake to Alert (on or off) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone / MDRRMO hotline | AGAP Citizen mobile app (Expo, React Native, Expo Router) |
| 2 | Printed advisories and forms | English and Filipino translation file in the app |
| 3 | Staff who can translate or repeat instructions | App-wide text component that applies text size and contrast |
| 4 | | Zustand preference store and Expo Secure Store (on the phone) |
| 5 | | NestJS REST API (`PATCH /v1/users/me`) with input validation |
| 6 | | PostgreSQL (`users` table: language, text size, contrast, motion) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A resident calls the MDRRMO hotline or walks in to report an emergency. |
| 2 | The operator speaks in Filipino or English, whichever they are used to. |
| 3 | If the caller is elderly, hard of hearing or confused, the operator repeats and slows down. |
| 4 | Written advisories and forms are printed in one size and one language. |
| 5 | Residents with low vision ask someone else to read printed material for them. |
| 6 | Misunderstood details are corrected only by calling back. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Verbal instructions in the operator's language |
| 2 | Printed advisories in one fixed size and language |
| 3 | Delays and repeated calls when the caller cannot follow |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | On first use, the onboarding screen asks for language, text size, High Contrast and Reduced Motion. | User Action |
| 2 | The app applies each choice at once: screens switch language, text is rescaled (0.875×, 1×, 1.15×), High Contrast darkens body text, and Reduced Motion stops decorative animations. | Processing |
| 3 | The app saves the choices in the phone's secure storage, so they apply even without a connection. | Database |
| 4 | Later, the citizen opens Profile, then Accessibility, which shows the same settings plus Shake to Alert. | User Action |
| 5 | Each change is saved on the phone and applied immediately. | Processing |
| 6 | When the citizen is signed in, the app also sends language, text size, High Contrast and Reduced Motion to the backend, which checks the values (text size must be Small, Medium or Large; switches must be on/off). | Validation |
| 7 | The backend saves the preferences on the citizen's account. | Database |
| 8 | If the phone is offline or the request fails, the phone keeps the new setting and nothing is blocked. | Processing |
| 9 | Each time the app starts, it loads the saved preferences from the phone before showing any screen. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | App screens in the chosen language |
| 2 | Text size, contrast and motion applied across the app |
| 3 | Preferences saved on the phone |
| 4 | Preferences saved on the citizen's account |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Switch to English, then Filipino; check the home, SOS and profile screens change language.
2. Set Large text and High Contrast; check text grows and body text turns black.
3. Turn on Reduced Motion; check the home screen and SOS button no longer animate.
4. Close and reopen the app; the settings stay.
5. Signed in, change the language, then check the `users` row (`preferred_language`).

**Do not claim:**
- Settings following the citizen to a new phone. The account stores them, but the app does not read them back at sign-in.
- Shake to Alert saved on the account. It is a phone-only setting.
- Languages other than English and Filipino, or screen-reader voice guidance beyond the system's own.
