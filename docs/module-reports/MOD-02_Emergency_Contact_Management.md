# MOD-02 — Emergency Contact Management

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-02 |
| Version | 1.0 |
| Module Name | Emergency Contact Management |
| Module Cluster | Cluster A — User and Identity |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets a signed-in citizen keep a list of emergency contacts (family members or other trusted people) in the AGAP app. The citizen adds, views, edits and removes contacts. Every saved contact is alerted by SMS when the citizen reports an emergency.

**Purpose**
Have the people who should know about an emergency recorded ahead of time, so they can be informed automatically by SMS when the citizen reports one. Nobody has to look them up or call them during the emergency.

**Tasks Performed**
1. Saves a contact's name, relationship, phone number and optional email.
2. Lists the citizen's active contacts in priority order.
3. Edits a contact's details.
4. Removes a contact after confirmation; the record is deactivated, not erased.
5. Restricts each contact list to its owner.
6. Supplies the active contacts to emergency contact notification (MOD-16).

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Names of relatives, recalled by the caller or bystander | Contact full name |
| 2 | Relatives' phone numbers from the caller's phone or memory | Relationship (optional) |
| 3 | Relationship to the patient, given verbally | Contact phone number |
| 4 | | Contact email address (optional) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Personal mobile phone (phonebook) | AGAP Citizen mobile app (Expo, React Native, Expo Router) |
| 2 | Telephone / MDRRMO hotline | TanStack Query (loading and refreshing the list) |
| 3 | Paper logbook or incident form | NestJS REST API (`/v1/emergency-contacts`) with input validation |
| 4 | | JWT sign-in check with an ownership check on every contact |
| 5 | | PostgreSQL (`emergency_contacts` table) |
| 6 | | Redis + BullMQ queue and Textbee SMS gateway (alerts sent by MOD-16) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | During an emergency, the operator or responder asks the caller or bystander who the patient's relatives are. |
| 2 | The caller looks up numbers on the patient's or their own phone, or tries to remember them. |
| 3 | The operator writes any numbers given in the logbook or incident form. |
| 4 | Staff call each relative one by one to tell them about the emergency. |
| 5 | If the patient is alone or unconscious, relatives often can't be identified or reached until later. |
| 6 | Contact details aren't kept for future emergencies. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Relatives' numbers written in the logbook or incident form, when available |
| 2 | Phone calls made by staff to inform relatives |
| 3 | Delayed or missing notice to relatives when no number is known |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The signed-in citizen opens Profile, then Emergency Contacts. | User Action |
| 2 | The backend confirms the sign-in token and returns only this citizen's active contacts, ordered by priority. The app lists each with name, relationship and number. | Database |
| 3 | The citizen taps Add Contact and enters full name, relationship (optional), phone number and email (optional). | User Action |
| 4 | The app requires a name and a phone number. The backend validates the fields (text fields, valid email format) before saving. | Validation |
| 5 | The backend saves the contact linked to the citizen's account, and the app refreshes the list. | Database |
| 6 | To edit, the citizen opens a contact, changes the details, and saves. The backend first checks that the contact belongs to the citizen. | Validation |
| 7 | The backend updates the contact record, and the list refreshes. | Database |
| 8 | To remove, the citizen taps delete and confirms in a dialog. The backend checks ownership and marks the contact inactive, so it drops off the list. | Database |
| 9 | When the citizen later submits an emergency report, the backend reads all of the citizen's active contacts. | Integration |
| 10 | Each of those contacts gets an SMS (through the queue and Textbee) with the reporter's name, the incident type and the reference number. This is done by MOD-16 and never blocks the report. | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Saved emergency contact records linked to the citizen's account |
| 2 | Up-to-date contact list on the citizen's phone, in priority order |
| 3 | Updated or deactivated contact records after edits and removals |
| 4 | List of contacts to alert, used for SMS notification on an emergency report (MOD-16) |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Add two contacts.
2. Edit one of them, then remove one.
3. Sign in as a different citizen and confirm the first citizen's contacts aren't visible.
4. With Textbee loaded, submit a test report and confirm the remaining contact gets the SMS and the removed one doesn't.

**Do not claim:**
- Philippine phone-number format checking. Today the phone field is only required; any text is accepted. Ask for a fix if you want to document it.
- A per-contact "alert on/off" switch. It was removed from the app and the API; every active contact is alerted.
- Reordering contact priority in the app. The backend `PATCH /emergency-contacts/:id/priority` exists, but no screen uses it, so new contacts all get priority 1.
