# MOD-20 — Real-Time Event / WebSocket Engine

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-20 |
| Version | 1.0 |
| Module Name | Real-Time Event / WebSocket Engine |
| Module Cluster | Cluster D — Alert Processing and Dispatch |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
The nervous system of the operations side of AGAP. Every status change — a new incident, a status transition, a unit's updated position, a dispatch — is distributed to every authorized client the instant it happens, instead of screens polling or needing a manual refresh.

**Purpose**
Give dispatchers, supervisors and responders situational awareness that is actually live, because in an emergency a status update that only reaches the one person on a specific radio channel is a status update most of the room doesn't have yet.

**Tasks Performed**
1. Requires a signed-in, authenticated connection before accepting a Socket.io client at all.
2. Scopes each client to "rooms" — their own incident, their organization's operations room — so nobody receives more than they're authorized to see.
3. Emits the standard event set (incident created/updated/status_changed/escalated/closed; dispatch created/updated/cancelled; resource and responder status/location updates; notification and escalation events) into the right room(s) the moment the underlying database write happens.
4. Treats the socket purely as a notification layer — the database write is always the source of truth, and a failed broadcast never blocks the action it was describing.
5. Lets a disconnected client reconnect and re-fetch current state via the REST API rather than relying on a replayed backlog of missed messages.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A phone call or radio call reporting a status change | The underlying event (incident created, status changed, unit location updated, dispatch created) raised by another module after its database write |
| 2 | The identity of whoever happens to be listening on that call/channel | The authenticated actor's JWT, used to admit the socket connection and determine which rooms they may join |
| 3 | Whatever the listener remembers to relay to the next person | The target room(s) for the event — incident-scoped, organization-scoped, or user-scoped |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Two-way radio / mobile phone call between staff | Socket.io gateway, `backend/src/realtime/agap.gateway.ts` (confirmed ~175 lines of real `@SubscribeMessage`/emit handlers, not a stub) |
| 2 | Whoever is on that specific channel at that moment | Authenticated connection handshake — a connection without a valid, unexpired JWT is rejected |
| 3 | Manual face-to-face or verbal relay to the next person | Room-scoped subscriptions (per-incident room, per-organization operations room, per-user room) |
| 4 | — | The standard event set: `incident.created/updated/status_changed/escalated/closed`, `dispatch.created/updated/cancelled`, `resource.status_changed/location_updated`, `responder.location_updated/status_changed/eta_updated`, `notification.created`, `escalation.created/updated` |
| 5 | — | PostgreSQL as the authoritative record the socket event only announces, never replaces |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | Something changes in the field (unit moves, incident status changes). |
| 2 | The person with that information calls or radios whoever they think needs to know. |
| 3 | Anyone not on that specific call or channel does not find out. |
| 4 | There is no way to confirm everyone who needed the update actually received it. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal update delivered only to whoever was reachable at that moment |
| 2 | No record of who was and wasn't informed |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A dispatcher's browser or a responder's phone opens a Socket.io connection; the gateway rejects the handshake if the user isn't signed in. | Validation |
| 2 | The authenticated client joins the rooms it's allowed to see — its own incident, its organization's operations room — and nothing more. | Processing |
| 3 | Another module (incidents, dispatch, fleet, notifications) performs its authoritative database write first. | Database |
| 4 | The gateway emits the matching event (e.g. `incident.created`, `responder.location_updated`) into the right room(s) immediately after that write. | Notification |
| 5 | Every open, authorized screen in that room updates without a manual refresh — typically within a second or two. | Notification |
| 6 | If the broadcast itself fails for any reason, the underlying action it was describing is unaffected — the socket is a notification layer, not the source of truth. | Processing |
| 7 | A disconnected client reconnects and re-fetches current state over the REST API rather than receiving a replayed backlog. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Live, room-scoped event delivered to every authorized connected client |
| 2 | A visible connection-state indicator on the dashboard distinguishing connected from disconnected |
| 3 | No change to the underlying database record — the event only announces a write that already happened |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Open two browser windows signed in as `dispatcher1@mdrrmo.bocaue.gov.ph` and `dispatcher2@mdrrmo.bocaue.gov.ph`, both on the Incident Command Queue; submit a new SOS from the phone and confirm it appears on both windows within a second or two with no manual refresh.
2. Stop and restart the backend briefly and confirm the dashboard's connection indicator clearly shows the disconnected state rather than silently freezing.

**Do not claim:**
- Guaranteed delivery or durable replay of events missed while a client was disconnected — the client re-fetches current state instead.
- That the socket layer is itself the source of truth — every event it emits corresponds to a PostgreSQL write that already happened.
