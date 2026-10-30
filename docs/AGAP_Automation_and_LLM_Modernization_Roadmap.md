# AGAP — Automation and LLM Modernization Roadmap

**Date:** 2026-10-29 (revised the same day: all 52 modules sorted into three lists)
**Status:** Proposal. Nothing in this document is built yet unless it says "already automated".
**Audience:** AGAP backend developers.
**Builds on:** [plans/AI_ASSIST_PLAN.md](plans/AI_ASSIST_PLAN.md). That plan holds the detailed phases for the AI foundation (its Phase 1), barangay reply reading (Phase 2) and the case brief (Phase 3). This roadmap decides **which modules need automation at all**, and covers everything outside those three phases.
**Related:** [100%ModulesFunctionalities+AdditionalModules.md](100%25ModulesFunctionalities+AdditionalModules.md) (what works today), [AGAP_Local_AI_Ollama_Integration.md](AGAP_Local_AI_Ollama_Integration.md) (offline model option).

> **Routes:** the backend serves `/v1/…`, not `/api/v1/…` (AI_ASSIST_PLAN, Gotchas). All paths below use `/v1`.
>
> **To build list C, use [plans/AUTOMATION_NEEDS_PLAN.md](plans/AUTOMATION_NEEDS_PLAN.md)** (4 phases, run with `/automation-plan <n>`). It was checked against the code on 2026-10-30 and wins where it differs from the sketches below.

---

## 1. Summary

All 52 modules (MOD-01 to MOD-53; MOD-19 was eliminated) were sorted into three lists:

| List | Count | Meaning |
|---|---|---|
| **A. No automation needed** | 30 | Already automated, or simple data entry where CRUD is the right design. Leave as is. |
| **B. Stays manual** | 14 | A person must make the decision (Rule 8, consent, medical judgment). Some have an **optional assist** that drafts or suggests, but the module stays manual. |
| **C. Needs automation** | 8 (+ A1) | A real gap today: something is missed, slow or non-compliant. These are the ones to build. |

**Main finding:** most of the automation AGAP needs is **rule-based, not LLM**. Of the 9 items in list C, only one needs an LLM: reading free-text barangay replies (A1). The LLM drafting features are useful extras (list B assists), not gaps. That matters during typhoons, when the internet goes down in the flood barangays: rule-based automation keeps working, and cloud AI doesn't.

**Build order for list C:** responder assignment push → surge recommendation → announcement STOP processing → barangay free-text replies (LLM) → unit heartbeat → hospital ranking → hotspot discovery → registry freshness.

---

## 2. Module classification (all 52)

### 2.1 List A: No automation needed (30)

**Already automated: nothing to add (22)**

| MOD | Module | How it's already automated |
|---|---|---|
| 05 | Emergency Readiness | Checklist computed from permissions and profile (`GET /v1/users/me/readiness`) |
| 06 | Immediate SOS Trigger | One flow, idempotent by client event ID |
| 07 | Shake-to-Alert | Sensor trigger + countdown starts the same SOS flow |
| 09 | Rapid Incident Detail Capture | Guided questions per type; answers feed MOD-24 automatically |
| 10 | Photo and Evidence Capture | Upload + Tier 1 provenance + **OpenAI** evidence review (`evidence-ai-review.service.ts`) |
| 11 | Precision GPS Capture | High-accuracy fix with accuracy reading |
| 12 | Reverse Geocoding | Nominatim lookup → address and barangay |
| 13 | Live Incident Location Tracking | Location history stored and pushed live |
| 14 | Incident Record and Ticketing | Persisted first, `INC-2026-NNNNNN` generated |
| 16 | Emergency Contact Notification | SMS to contacts on submit (Textbee) |
| 17 | Multi-Channel Transmission | MDRRMO SMS queued after persistence, < 160 chars |
| 20 | Real-Time WebSocket Engine | Socket.io rooms and events |
| 21 | Operations Dashboard | Live KPI tiles per role |
| 22 | Real-Time Incident Map | Live markers and overlays |
| 24 | Severity and Priority Recommendation | Deterministic rules; dispatcher confirms |
| 29 | Capability Matrix | Required capabilities for all 8 categories |
| 30 | Unit Recommendation | Capability + PostGIS distance scoring |
| 41 | SLA and Escalation Engine | BullMQ `sla-monitor` raises escalations |
| 42 | User-Facing Emergency Status | Push + app notice per status step (A8) |
| 43 | Live ETA and Responder Tracking | `eta-refresh` job, always labelled "est." |
| 46 | Immutable Audit Trail | Every consequential action writes a row; DB refuses UPDATE/DELETE |
| 50 | Emergency Response Analytics | Nightly aggregation cron at 01:00. *Optional extra:* LLM weekly narrative (§6.6) |

**Data entry or configuration: CRUD is the correct design (8)**

| MOD | Module | Why it stays CRUD |
|---|---|---|
| 01 | User Registration and Profile | The person enters their own data. OTP and the Bocaue geo-check are already automatic. |
| 02 | Emergency Contact Management | Owner-entered personal contacts. *Small fix, not automation:* phone-format validation. |
| 03 | Medical Profile | Owner-entered and consent-gated. Medical data must never be generated or inferred. |
| 04 | Accessibility and Multi-Language | User preferences. |
| 27 | Organization and Resource Registry | Administrative master data. Freshness reminders are covered under MOD-39 (§4.8). |
| 33 | Secure Incident Communication | Human-to-human chat. Chat content is never sent to an LLM. |
| 47 | Role-Based Access Control | Security configuration must be explicit and reviewed. |
| 49 | System Administration | Account management by an administrator. |

### 2.2 List B: Stays manual (14)

These modules are manual **on purpose**. Automation here may only **suggest or draft**. A person still clicks, and the click is audited.

| MOD | Module | Why it must stay manual | Optional assist (never decides) | Worth building? |
|---|---|---|---|---|
| 08 | Cancellation and False Alerts | Citizen cancellation is the citizen's act; marking a false alert is a dispatcher decision (Rule 8) | None | No |
| 15 | Incident Lifecycle State Management | Status changes are permission-controlled human actions | None | No |
| 23 | Incident Command Queue | Dispatcher works the queue | AI case brief + English translation (AI plan Phase 3) | Optional, after DPO sign-off |
| 25 | Triage and Validation | Validation is a judgment call | Same case brief; hazard-flag suggestions (§6.1) | Optional, after DPO sign-off |
| 26 | Duplicate Detection and Merging | Merging is irreversible in practice; candidates are already automatic | None | No |
| 31 | Dispatch Authorization | Rule 8; recommendation already automatic (MOD-30) | None | No |
| 34 | Multi-Agency Coordination | Adding an agency widens who sees the incident | Rule-based agency suggestion, e.g. BFP for FIRE (§6.2) | Yes, cheap |
| 35 | Resource Request and Mutual Aid | The receiving organization decides | None | No |
| 36 | Incident Command / ICS Support | Supervisor decision | Suggest ICS activation when surge is active (§6.2) | Optional |
| 37 | On-Scene Patient Assessment | Clinical observation by the responder; medical data | None | No |
| 40 | Transport and Destination Tracking | The crew attests the start and the arrival | Arrival prompt when GPS enters the hospital's geofence (§6.3) | Optional |
| 44 | Incident Handover | Outgoing staff are accountable for what they hand over | LLM draft of the summary and pending actions (§6.4) | Optional |
| 45 | Resolution and Closure | Outcome and disposition must be human-attested | LLM draft of the resolution notes only (§6.5) | Optional |
| 48 | Privacy, Consent and Medical Data | Consent must be an explicit human act | None | No |

### 2.3 List C: Needs automation (8 + A1)

Each of these has a gap today that causes a missed alert, a delay, stale data or a compliance problem.

| # | MOD | Gap today | Automation | Type | Priority |
|---|---|---|---|---|---|
| C1 | 18 / 32 | Responders get **no push** for a new assignment. The app polls every 15 s, and only while it's open. | Push to every crew member on dispatch | Rules + FCM | **High** |
| C2 | 52 | Nobody gets an early signal for surge; the triage-tag list polls every 30–60 s | Surge-recommendation cron + a live triage-tag event | Rules + WebSocket | **High** |
| C3 | 53 | The announcement SMS says "Reply STOP to opt out", but **STOP is never processed**. That's a consent gap under RA 10173. | Process STOP/unsubscribe replies automatically | Rules | **High** |
| C4 | A1 (ext. 34) | Free-text barangay replies (`nandito na kami`) are stored as `UNPARSED` and sit unread | Classify with an LLM → dispatcher applies | **LLM** | **High** |
| C5 | 28 | A unit whose phone went offline stays AVAILABLE and can still be recommended | Heartbeat staleness flag | Job | Medium |
| C6 | 38 | Hospital referral is picked from a plain list, with no capability or receiving-status ranking | Transparent hospital ranking | Rules | Medium |
| C7 | 51 | Risk areas exist only if an admin types them in | Nightly PostGIS hotspot proposals | Job | Medium |
| C8 | 39 | Hospital `receiving_status` and capacity go stale without anyone noticing | Freshness reminders + staleness display | Job | Low |

MOD-53 also has an optional LLM draft assist for composing announcements (§6.7). It isn't the gap, so it isn't counted in C3.

---

## 3. Guardrails (non-negotiable for every item)

From the CLAUDE.md architectural rules. Any item that breaks one is out of scope.

| Rule | What it means for automation |
|---|---|
| 7: Critical persistence is synchronous | Nothing in the emergency path waits on a job or an LLM. Automation runs **after** the record is saved. |
| 8: Recommendations never decide | Automation never changes status, dispatches, merges, marks a false alert, closes, publishes or activates surge. It **suggests**, and a person accepts. |
| 10 / MOD-48: Least privilege | No names, phones, emails, reporter identity, medical data, exact GPS, photos or chat go to an LLM. |
| 11: Attributable | Accepting or dismissing a suggestion is audited with the actor. |
| 13: ETA is an estimate | Any generated text that mentions time says "estimated". |
| Reliability rules | A failed push, SMS, job or AI call never changes or deletes an incident. With automation off or failing, AGAP behaves exactly as today. |
| No unbounded `latest` | Pin exact model IDs. |

---

## 4. List C: Implementation roadmaps

### 4.1 C1 — MOD-18 / 32: Responder assignment push

**Today:** `DispatchService.create` emits `dispatch.created` over WebSocket and pushes the *reporter* ("help is on the way"). It sends nothing to the responder's phone. The responder app polls `GET /v1/responders/me/assignments` every 15 s (`useResponderAssignments.ts`), and only while it's in the foreground, so a backgrounded phone can miss an assignment entirely.

**Automate:** after the dispatch transaction commits, queue one `PUSH` job per crew member (`dispatch_crew.user_id`) on the existing `NOTIFICATIONS` queue. `NotificationProcessor.sendPush` already looks up the user's FCM token (`system_configurations` key `fcm_token:<userId>`) and sends through Firebase. Tapping the push opens the assignment screen.

**Where:**
- [dispatch.service.ts](../backend/src/dispatch/dispatch.service.ts): after `notifyDispatchCreated`, outside the transaction
- `mobile/src/services/push/push-registration.ts`: make sure responders register a token, not only citizens
- Mobile notification handler: route `data.type === 'ASSIGNMENT'` to `/responder/assignment/[id]`

```ts
// dispatch.service.ts — after the transaction, next to the reporter notice
// MOD-18: wake every crew phone. A failed push never affects the dispatch (Reliability rules).
try {
  const crew = await this.prisma.dispatch_crew.findMany({
    where: { dispatch_id: dispatch.id },
    select: { user_id: true },
  });
  await Promise.all(
    crew.map((c) =>
      this.notificationQueue.add(
        'responder-assignment-push',
        {
          channel: 'PUSH',
          userId: c.user_id,
          title: 'New assignment',
          body: `${incident.category} · ${incident.public_reference}. Open AGAP to accept.`,
          data: { type: 'ASSIGNMENT', dispatchId: dispatch.id },
          androidChannelId: 'assignments', // high-importance channel on the phone
        },
        // BullMQ rejects ':' in custom IDs unless there are exactly 3 parts: use '-'.
        { jobId: `assign-${dispatch.id}-${c.user_id}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      ),
    ),
  );
} catch (err) {
  this.logger.error(`Responder push enqueue failed: ${String(err)}. Dispatch unaffected.`);
}
```

Keep the 15-second polling as the fallback. Don't put patient details or the address in the push body, because it shows on the lock screen.

**Also send the push when** crew is added to an existing dispatch, and send a "Cancelled" push when a dispatch is cancelled.

**Done when:** a dispatch to a backgrounded responder phone shows a push within ~5 s; a missing FCM token logs a warning and the dispatch still succeeds; the MOD-32 🟡 limit in the module list can be removed.

### 4.2 C2 — MOD-52: Surge recommendation and live triage tags

**Today:** a supervisor watches the queue and activates surge mode by hand (`DisasterModeService.activate`). The triage-tag list polls every 30–60 s (`frontend/features/surge/hooks.ts`).

**Automate (a): surge recommendation.** A cron every 5 minutes checks thresholds. When one trips and no surge is active, it sends an **app notice** to every Supervisor with the reason, plus a `surge.recommended` ops-room event. It **never activates surge**: the supervisor clicks Activate, with the reason prefilled. *(2026-10-30: this isn't an escalation, because `Escalation.incident_id` is required and a surge spans many incidents.)*

**Where:** `backend/src/disaster-mode/surge-detector.service.ts` (new), registered in `disaster-mode.module.ts`, using `@Cron` like `analytics-cron.service.ts`.

```ts
const RULES = [
  { id: 'VOLUME', windowMin: 30, minIncidents: 8 },                        // any category, municipality-wide
  { id: 'FLOOD_CLUSTER', windowMin: 30, minIncidents: 5, category: 'FLOOD',
    barangays: ['Lolomboy', 'Bunlo', 'Igulot', 'Bambang'] },
  { id: 'INDUSTRIAL', windowMin: 15, minIncidents: 2, category: 'INDUSTRIAL',
    barangays: ['Bundukan', 'Biñang 1st'] },                               // fireworks zone
] as const;

@Cron('*/5 * * * *')
async evaluate(): Promise<void> {
  if (await this.prisma.surge_incidents.findFirst({ where: { status: 'ACTIVE' } })) return;
  for (const rule of RULES) {
    const since = new Date(Date.now() - rule.windowMin * 60_000);
    const count = await this.prisma.incident.count({
      where: {
        created_at: { gte: since },
        status: { notIn: ['CANCELLED', 'FALSE_ALERT', 'DUPLICATE'] },
        ...('category' in rule && { category: rule.category }),
        ...('barangays' in rule && { incident_locations: { barangay: { in: [...rule.barangays] } } }),
      },
    });
    if (count >= rule.minIncidents) {
      // One notice per rule per hour, so supervisors aren't spammed.
      await this.notifySupervisorsOnce(rule.id, { count, since }); // NotificationsService IN_APP + surge.recommended
    }
  }
}
```

The thresholds are placeholders for MDRRMO to set. Keep them in config rows (like `sla_policies`) so they can be tuned without a deploy. **River level:** `surge_incidents.bocaue_river_level` exists, but there's no live gauge feed. Add a manual "River level" entry on the surge page. At ≥ 11.50 m, the detector raises the recommendation regardless of incident count.

**Automate (b): live triage tags.** Emit `surge.triage_tag_updated` (ops room) whenever a tag is created or changed, and invalidate the query in `frontend/providers/socket-provider.tsx`. Keep the 30–60 s poll as a fallback. This removes the MOD-52 🟡 limit.

**Done when:** a seeded burst of 5 FLOOD incidents in Bunlo sends exactly one notice per Supervisor; nothing activates on its own; a tag change appears on a second screen within ~2 s.

### 4.3 C3 — MOD-53: Process STOP and unsubscribe replies

**Today:** every announcement SMS ends with "Reply STOP to opt out" (`announcements.service.ts`), and `sms_subscribers` already has `is_active`, `opted_out_at` and `opt_out_source`. But nothing reads STOP replies: a STOP from a subscriber reaches the barangay reply poller and is stored as `UNKNOWN_SENDER`. Under RA 10173, an opt-out has to be honoured.

**Automate:** in the inbound SMS path, check for an opt-out keyword **before** the barangay logic. When the sender is an active subscriber, deactivate them, audit it and send one confirmation. No LLM is needed.

**Where:**
- `backend/src/announcements/sms-opt-out.ts` (new): keyword matcher
- [barangay-reply.service.ts](../backend/src/barangay-coordination/barangay-reply.service.ts): call the opt-out handler first, before `parseBarangayReply`. Barangay contacts are exempt, so a hotline's "STOP" never unsubscribes MDRRMO alerts.

```ts
// sms-opt-out.ts
const OPT_OUT = /^\s*(stop|unsubscribe|cancel|end|quit|itigil|huwag na)\s*[.!]?\s*$/i;
export const isOptOut = (body: string): boolean => OPT_OUT.test(body);

// announcements.service.ts
async optOutBySms(phoneE164: string): Promise<boolean> {
  const sub = await this.prisma.sms_subscribers.findFirst({ where: { phone_number: phoneE164, is_active: true } });
  if (!sub) return false;
  await this.prisma.sms_subscribers.update({
    where: { id: sub.id },
    data: { is_active: false, opted_out_at: new Date(), opt_out_source: 'SMS_STOP' },
  });
  void this.audit.log({ action: AuditAction.UNSUBSCRIBE, entityType: 'sms_subscriber', entityId: sub.id, moduleId: 'MOD-53' });
  await this.smsQueue.add('announcement-sms', { phone: phoneE164, message: 'AGAP: You are unsubscribed from Bocaue announcements. Emergencies: call 911.' });
  return true;
}
```

`phone_number` is stored as typed (e.g. `09171234567`), so match the sender against its `+63…`, `63…` and `09…` forms. The poller currently runs only when `BARANGAY_SMS_REPLIES_ENABLED=true`, so it also needs its own opt-out switch (see the plan, Phase 1). Add an **Unsubscribe** button to `mobile/app/announcements/subscribe.tsx`; `POST /v1/announcements/unsubscribe` already exists.

**Done when:** STOP from a subscriber deactivates them and sends one confirmation; STOP from a barangay contact changes nothing; the next announcement skips the opted-out number.

### 4.4 C4 — A1 / MOD-34: Free-text barangay replies (LLM)

**Today:** the poller stores every inbound text in `barangay_sms_inbound`. `parseBarangayReply` applies exact codes (`OTW 4416`). A known sender's free text is stored as `UNPARSED` and waits for a dispatcher to read it.

**Automate:** this is AI_ASSIST_PLAN **Phase 2**. Its precondition is now met:
- `barangay_sms_inbound` is filled by the poller;
- `BarangayCallbackService.reportBySms(notice, status)` exists and accepts the full status set `SEEN | ON_THE_WAY | ON_SCENE | HANDLED | NEEDS_BACKUP`.

The remaining work is to pass the dispatcher (`actorId`) and the suggestion ID through `reportBySms` for the audit row. Build the rest from the plan.

**Where:** after the `barangay_sms_inbound.create` in `barangay-reply.service.ts`, when `decision.outcome === 'UNPARSED' && decision.knownSender`, queue `reply-<inboundId>`. `UNPARSED` rows have no `notice_id`: attach the suggestion only when the sender's barangay has exactly one open notice. Otherwise show the text and translation, and let the dispatcher pick the case.

```ts
// backend/src/ai-assist/prompts/barangay-reply.prompt.ts — labels match BARANGAY_LINK_STATUSES
export const BarangayReplySchema = z.object({
  status: z.enum(['SEEN', 'ON_THE_WAY', 'ON_SCENE', 'HANDLED', 'NEEDS_BACKUP', 'UNCLEAR']),
  confidence: z.number().min(0).max(1),
  english: z.string().max(120),
});

export const BARANGAY_REPLY_INSTRUCTIONS = `You read SMS replies from barangay emergency staff in Bocaue, Bulacan.
Replies may be Filipino, English or Taglish, with typos. Pick the one status the reply reports.
Use UNCLEAR when unsure; never guess. If the reply asks for help, people or equipment, use NEEDS_BACKUP.
english: a short literal English reading.`;

// Runner: only the redacted body goes out. No incident data, no phone number.
const result = await this.ai.structured('BARANGAY_REPLY', BARANGAY_REPLY_INSTRUCTIONS, redactForAi(row.body, 500), BarangayReplySchema);
// UNCLEAR or confidence < 0.6 → status INFO (show text + english only); else PENDING_REVIEW.
```

**Never auto-applied.** Accept goes through `reportBySms`, so `NEEDS_BACKUP` still raises the supervisor escalation. **Done when:** the AI plan's Phase 2 checklist passes, including ≥ 90% on the fixtures and **zero** `NEEDS_BACKUP` replies read as a calm status.

### 4.5 C5 — MOD-28: Unit heartbeat staleness

**Today:** unit status changes automatically on dispatch and resolve. A unit whose responder phone went offline stays AVAILABLE and can be recommended.

**Automate:** every 2 minutes, flag AVAILABLE units with no `location_history` row in the last 10 minutes as **stale**. Don't change their status (that's the crew's or dispatcher's call). Show "No signal 12 min" on the fleet board, and have `resource-matching` lower the unit's score with a visible reason.

**Where:** `backend/src/fleet/unit-heartbeat.service.ts` (new); `backend/src/dispatch/resource-matching` reads the stale set.

```ts
@Cron('*/2 * * * *')
async markStale(): Promise<void> {
  const rows = await this.prisma.$queryRaw<Array<{ id: string; last_at: Date | null }>>`
    SELECT r.id, max(lh.recorded_at) AS last_at
    FROM resources r
    LEFT JOIN location_history lh ON lh.resource_id = r.id AND lh.recorded_at > now() - interval '1 day'
    WHERE r.is_active AND r.status = 'AVAILABLE'
    GROUP BY r.id
    HAVING max(lh.recorded_at) IS NULL OR max(lh.recorded_at) < now() - interval '10 minutes'`;
  await this.cache.setStaleUnits(rows);          // Redis set, read by fleet + resource-matching
  this.realtime.emitToOps('resource.status_changed', { stale: rows.map((r) => r.id) });
}
```

The query uses the existing `idx_loc_history_resource (resource_id, recorded_at DESC)` index. The flag lives in Redis, not a column, so it never becomes source-of-truth data.

### 4.6 C6 — MOD-38: Hospital ranking for referrals

**Today:** the dispatcher picks a hospital from a plain list; the responder's destination picker sorts by distance only.
**Automate:** rank active facilities with a transparent score and show the reasons, like unit recommendation. The dispatcher still chooses.

**Where:** `backend/src/hospitals/referral-ranking.ts` (new); `GET /v1/hospitals/recommendations?incidentId=`; shown in the drawer's **Refer to hospital** dialog and reusable in `DestinationPicker.tsx`.

```ts
export function scoreFacility(f: FacilityRow, need: { icu: boolean; er: boolean }, km: number) {
  const reasons: string[] = [];
  let score = 100 - Math.min(km, 30) * 2;                       // closer is better
  // facility_receiving_status: OPEN | AT_CAPACITY | CLOSED | EMERGENCY_ONLY | UNKNOWN
  if (f.receiving_status === 'CLOSED') { score -= 80; reasons.push('Closed to receiving'); }
  if (f.receiving_status === 'AT_CAPACITY') { score -= 50; reasons.push('At capacity'); }
  if (f.receiving_status === 'UNKNOWN') { score -= 10; reasons.push('Receiving status unknown'); }
  if (need.er && !f.has_emergency_room) { score -= 40; reasons.push('No ER'); }
  if (need.icu && f.has_icu) { score += 15; reasons.push('Has ICU'); }
  if (f.capacity_available === 0) { score -= 30; reasons.push('No beds reported'); }
  return { score, reasons, distanceLabel: `${km.toFixed(1)} km (straight line)` };
}
```

`EMERGENCY_ONLY` gets no penalty for an emergency referral. Derive `need` from priority and category (e.g. CRITICAL → ER required). The ranking uses only facility data, never patient data.

### 4.7 C7 — MOD-51: Hotspot discovery

**Today:** risk areas exist only if the System Administrator types them in.
**Automate:** a nightly job clusters the last 90 days of incidents with PostGIS and stores **proposals**. The administrator approves them on Administration → Risk Areas, which creates the `risk_areas` row through the existing audited path.

**Where:** `backend/src/risk-intelligence/hotspot-discovery.service.ts` + a `risk_area_proposals` table.

```sql
-- 150 m radius, at least 4 incidents per cluster, same category
SELECT category,
       ST_AsText(ST_ConvexHull(ST_Collect(point::geometry))) AS hull,
       count(*) AS n,
       mode() WITHIN GROUP (ORDER BY barangay) AS barangay
FROM (
  SELECT i.category, il.point, il.barangay,
         ST_ClusterDBSCAN(ST_Transform(il.point::geometry, 32651), eps := 150, minpoints := 4)
           OVER (PARTITION BY i.category) AS cid
  FROM incidents i
  JOIN incident_locations il ON il.incident_id = i.id
  WHERE i.created_at > now() - interval '90 days'
    AND i.status NOT IN ('FALSE_ALERT', 'DUPLICATE', 'CANCELLED')
) c
WHERE cid IS NOT NULL
GROUP BY category, cid;
```

EPSG:32651 (UTM 51N) gives metres for Bulacan.

### 4.8 C8 — MOD-39: Registry freshness

**Today:** `Facility.receiving_status`, `capacity_available` and `last_verified_at` are updated by hand, and nothing notices when they go stale.
**Automate:** an hourly job:
- sends an app notice to the hospital's users when `receiving_status` hasn't changed in 6 hours;
- shows "Unknown (last updated 9 h ago)" in the ranking (C6) after 12 hours, without overwriting the stored value;
- sends a monthly reminder to Org Administrators about facilities and resources (MOD-27) whose `last_verified_at` is more than 90 days old.

---

## 5. Shared LLM foundation

**Needed for:** C4 (barangay replies) and the optional LLM assists in §6. Rule-based items C1–C3 and C5–C8 don't need it.

The detailed phase and its "Done when" checklist are in **AI_ASSIST_PLAN Phase 1**. This roadmap changes that phase in three ways (the plan has been updated to match):
1. No new dependency: `openai` **7.42.0** and `zod` are installed, and `OPENAI_API_KEY` is already in `backend/.env` and `config.validation.ts`.
2. `ai_suggestions.incident_id` is **nullable**, with `subject_type` / `subject_id`, so announcement and analytics drafts can use the same table.
3. API roles are Dispatcher and Supervisor only. The System Administrator has no operational powers since role dashboards Phase 5b.

### 5.1 Files

```
backend/src/ai-assist/
├── ai-assist.module.ts
├── ai-client.service.ts          ← the ONLY new file that imports 'openai'
├── redact.ts                     ← redactForAi + field allow-lists
├── ai-suggestions.service.ts     ← create / list / accept / dismiss (+ audit)
├── ai-suggestions.controller.ts
├── ai-task-runner.service.ts     ← builds input, calls the client, stores the row
└── prompts/                      ← one file per task: instructions + zod schema
backend/src/jobs/processors/ai-assist.processor.ts
shared/src/constants/queue.constants.ts      ← add AI_ASSIST: 'ai-assist'
shared/src/events/                           ← add ai.suggestion_created (ops room only)
backend/prisma/migrations/<timestamp>_ai_suggestions/
backend/test/ai-assist/
```

### 5.2 Environment

`OPENAI_API_KEY` already exists in `.env.example` and `config.validation.ts`. Only add the switches below. **Never put a real key in `.env.example` or any committed file.** The real key lives only in `backend/.env`, which is git-ignored.

```bash
# --- AI Assist (suggestions only; never in the emergency path) ---
# Reuses OPENAI_API_KEY above. Off by default: with false, no job is queued and no call is made.
AI_ASSIST_ENABLED=false
# Exact model ID (no "latest" alias). Empty = OPENAI_EVIDENCE_REVIEW_MODEL.
OPENAI_MODEL=
AI_ASSIST_TIMEOUT_MS=8000
AI_ASSIST_DAILY_LIMIT=500
```

```ts
// backend/src/config/config.validation.ts — add after OPENAI_GEOCODE_ASSIST_MODEL
  // AI Assist (AI_ASSIST_PLAN + automation roadmap). Suggestions only, never in the
  // emergency path. Off unless 'true'; reuses OPENAI_API_KEY.
  @IsString()
  @IsOptional()
  AI_ASSIST_ENABLED: string = 'false';

  @IsString()
  @IsOptional()
  OPENAI_MODEL?: string;

  @IsInt()
  @IsOptional()
  AI_ASSIST_TIMEOUT_MS: number = 8000;

  @IsInt()
  @IsOptional()
  AI_ASSIST_DAILY_LIMIT: number = 500;
```

In `validateConfig`, refuse to boot when `AI_ASSIST_ENABLED === 'true'` and `OPENAI_API_KEY` is empty.

### 5.3 `ai-client.service.ts`

The key is read from `process.env.OPENAI_API_KEY`. `ConfigModule.forRoot` in [app.module.ts](../backend/src/app.module.ts) loads `backend/.env` (`envFilePath: ['.env.local', '.env']`) into `process.env` before any provider is constructed. The key is never logged, returned or stored. The backend reads `.env` only at startup, so restart it after changing AI config.

```ts
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { PrismaService } from '../common/prisma/prisma.service';

export type AiTask =
  | 'BARANGAY_REPLY'
  | 'CASE_BRIEF'
  | 'HANDOVER_DRAFT'
  | 'CLOSURE_DRAFT'
  | 'ANNOUNCEMENT_DRAFT'
  | 'ANALYTICS_NARRATIVE';

export type AiResult<T> =
  | { ok: true; value: T; model: string; latencyMs: number }
  | { ok: false; error: 'DISABLED' | 'DAILY_LIMIT' | 'CALL_FAILED' | 'SCHEMA'; model?: string; latencyMs?: number };

/**
 * The one OpenAI client for AI Assist. It never throws: every failure comes back as
 * { ok: false } so callers fall back to today's behaviour. Disabled unless
 * AI_ASSIST_ENABLED is 'true' and OPENAI_API_KEY is set.
 */
@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly dailyLimit: number;

  constructor(private readonly prisma: PrismaService) {
    // Loaded from backend/.env by ConfigModule at boot. Never hardcode or log it.
    const apiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
    const enabled = process.env.AI_ASSIST_ENABLED === 'true';
    this.model = process.env.OPENAI_MODEL || process.env.OPENAI_EVIDENCE_REVIEW_MODEL || '';
    this.timeoutMs = Number(process.env.AI_ASSIST_TIMEOUT_MS ?? 8000);
    this.dailyLimit = Number(process.env.AI_ASSIST_DAILY_LIMIT ?? 500);
    // maxRetries 0: the BullMQ job owns retries, never the HTTP client.
    this.client = enabled && apiKey && this.model ? new OpenAI({ apiKey, maxRetries: 0 }) : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async structured<S extends z.ZodTypeAny>(
    task: AiTask,
    instructions: string,
    input: string,
    schema: S,
  ): Promise<AiResult<z.infer<S>>> {
    if (!this.client) return { ok: false, error: 'DISABLED' };
    if (await this.overDailyLimit()) return { ok: false, error: 'DAILY_LIMIT' };

    const started = Date.now();
    try {
      const response = await this.client.responses.parse(
        {
          model: this.model,
          instructions,
          input,
          store: false, // don't keep incident-derived text on OpenAI's side
          text: { format: zodTextFormat(schema, task.toLowerCase()) },
        },
        { timeout: this.timeoutMs },
      );
      const latencyMs = Date.now() - started;
      // Validate again: structured output narrows the shape, zod enforces our limits.
      const parsed = schema.safeParse(response.output_parsed);
      if (!parsed.success) return { ok: false, error: 'SCHEMA', model: this.model, latencyMs };
      return { ok: true, value: parsed.data, model: this.model, latencyMs };
    } catch (err) {
      // Log the error class only: the message can echo request content.
      this.logger.warn(`AI ${task} failed: ${err instanceof Error ? err.name : 'unknown error'}`);
      return { ok: false, error: 'CALL_FAILED', model: this.model, latencyMs: Date.now() - started };
    }
  }

  private async overDailyLimit(): Promise<boolean> {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const used = await this.prisma.ai_suggestions.count({ where: { created_at: { gte: since } } });
    return used >= this.dailyLimit;
  }
}
```

The existing `EvidenceAiReviewService` and `HospitalNameAssistService` can stay as they are. Moving them onto this client later is optional cleanup that would give them the daily limit too.

### 5.4 `redact.ts`

```ts
const PH_MOBILE = /(\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_ID = /\b\d{8,}\b/g;              // IDs, account and plate-like numbers
const COORDS = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g;

/** Strip contact details and coordinates from free text before it leaves AGAP. */
export function redactForAi(text: string | null | undefined, max = 1500): string {
  if (!text) return '';
  return text
    .replace(EMAIL, '[removed]')
    .replace(PH_MOBILE, '[removed]')
    .replace(COORDS, '[location removed]')
    .replace(LONG_ID, '[removed]')
    .slice(0, max);
}
```

Build every incident input with an explicit Prisma `select` limited to the AI plan's "Sent" column. **Never** spread an incident row into a prompt: the allow-list is what keeps reporter, patient and medical fields out as the schema grows.

### 5.5 Database migration

```prisma
enum ai_suggestion_kind {
  BARANGAY_REPLY
  CASE_BRIEF
  HANDOVER_DRAFT
  CLOSURE_DRAFT
  ANNOUNCEMENT_DRAFT
  ANALYTICS_NARRATIVE
}

enum ai_suggestion_status {
  PENDING_REVIEW
  ACCEPTED
  DISMISSED
  INFO
  FAILED
  SUPERSEDED
}

model ai_suggestions {
  id              String               @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  incident_id     String?              @db.Uuid          // null for announcements / analytics
  subject_type    String?              @db.VarChar(40)   // 'barangay_sms_inbound' | 'Announcement' | ...
  subject_id      String?              @db.Uuid
  kind            ai_suggestion_kind
  status          ai_suggestion_status
  input_hash      String               @db.VarChar(64)   // sha256 of the redacted input
  output          Json?
  model           String               @db.VarChar(80)
  latency_ms      Int?
  error           String?              @db.VarChar(40)   // AiResult error code only, never a message
  requested_by_id String?              @db.Uuid
  reviewed_by_id  String?              @db.Uuid
  reviewed_at     DateTime?            @db.Timestamptz(6)
  created_at      DateTime             @default(now()) @db.Timestamptz(6)
  incidents       Incident?            @relation(fields: [incident_id], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([incident_id, kind, created_at(sort: Desc)])
  @@index([subject_type, subject_id])
  @@index([created_at])
}
```

Write the migration SQL by hand and apply it with `pnpm prisma migrate deploy`. Don't use `migrate dev` or `reset` on a shared database.

### 5.6 Queue and processor

```ts
// backend/src/jobs/processors/ai-assist.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { AiTaskRunner, type AiAssistJobData } from '../../ai-assist/ai-task-runner.service';

@Processor(QUEUE_NAMES.AI_ASSIST, { concurrency: 2 })
export class AiAssistProcessor extends WorkerHost {
  constructor(private readonly runner: AiTaskRunner) {
    super();
  }

  async process(job: Job<AiAssistJobData>): Promise<void> {
    // The runner stores a row for every outcome (including FAILED) and emits
    // ai.suggestion_created. It never throws, so BullMQ never retries a bad answer.
    await this.runner.run(job.data);
  }
}
```

Give jobs deterministic IDs so duplicate triggers collapse: `reply-<inboundId>`, `brief-<incidentId>`, `narrative-<weekStart>`. Use `-`, not `:`: BullMQ throws on a custom ID with `:` unless it has exactly 3 parts.

### 5.7 API (Dispatcher and Supervisor unless noted)

| Method | Path | Used by |
|---|---|---|
| GET | `/v1/incidents/:id/ai-suggestions` | C4, §6.1 |
| POST | `/v1/ai-suggestions/:sid/accept` | C4, §6.1 |
| POST | `/v1/ai-suggestions/:sid/dismiss` | C4, §6.1 |
| POST | `/v1/incidents/:id/ai-brief/refresh` (max 1/min) | §6.1 |
| POST | `/v1/incidents/:id/handover-draft` | §6.4 |
| POST | `/v1/incidents/:id/closure-draft` | §6.5 |
| POST | `/v1/announcements/ai-draft` (Announcements Publisher) | §6.7 |
| GET | `/v1/analytics/narrative?week=` (Supervisor, LGU) | §6.6 |

Accept and dismiss write `AuditService.log({ action: AuditAction.UPDATE, moduleId: 'MOD-46', entityType: 'ai_suggestion', ... })` with the actor.

---

## 6. List B and A: Optional assists

Build these only after list C, and only the ones the team wants. Each one leaves its module manual: a person reviews, edits and clicks.

### 6.1 MOD-23 / 25: Case brief, translation and hazard suggestions (LLM)

This is AI_ASSIST_PLAN **Phase 3**. Build it from the plan: its trigger (10 s delay after creation, after an assessment, and every 5th timeline event), its output (`summary`, `keyFacts`, `language`, `descriptionEnglish`) and its drawer card. **Blocked on** the DPO decision about names in free-text descriptions (§9).

Optional extension: add `suggestedHazardFlags: z.array(z.string().max(200)).max(6)` to the plan's schema. `hazard_flags` are free "Heading: answer" strings from caller intake (`shared/src/constants/incident-intake.ts`), not an enum. The dispatcher ticks one to add it, and that's audited as a normal edit. The LLM **never** suggests a priority; MOD-24's rules stay the only source.

### 6.2 MOD-34 / 36: Agency and ICS suggestions (rules)

When an incident is ASSESSED, a rule table proposes agencies. The drawer shows "Suggested: BFP (FIRE category)" with an **Add** button that calls the existing endpoint. When surge mode is active, suggest ICS activation to the supervisor the same way.

```ts
// backend/src/organizations/agency-suggestion.ts — organization_type values: MDRRMO | BFP | PNP | HOSPITAL | EMS_PROVIDER | NGO | LGU | OTHER
export const AGENCY_RULES: Array<{ when: (i: { category: string; hazardFlags: string[] }) => boolean; orgType: string; reason: string }> = [
  { when: (i) => i.category === 'FIRE' || i.category === 'INDUSTRIAL', orgType: 'BFP', reason: 'Fire / industrial category' },
  { when: (i) => i.hazardFlags.some((f) => /chemical|gas|explos|paputok/i.test(f)), orgType: 'BFP', reason: 'Hazardous material reported' },
  { when: (i) => i.category === 'ROAD_ACCIDENT', orgType: 'PNP', reason: 'Road accident' },
];
```

Serve it from `GET /v1/incidents/:id/agency-suggestions`, excluding agencies already participating.

### 6.3 MOD-40: Arrival prompt (rules)

When the crew's live location comes within ~75 m of the destination facility during TRANSPORTING, show "Arrived at <hospital>?" with one tap on the responder app. The crew still taps; nothing records an arrival on its own. This reuses the location updates the app already sends.

### 6.4 MOD-44: Handover draft (LLM)

**Draft with AI** in the handover form calls `POST /v1/incidents/:id/handover-draft`. It runs synchronously with the 8-second timeout, the way `HospitalNameAssistService` does: a person is waiting and it's off the emergency path. It returns a draft or `null`, and the form is prefilled and fully editable. The handover itself is still created by the person through the existing endpoint. Unit call signs may be included; responder names may not.

```ts
export const HandoverDraftSchema = z.object({
  situationSummary: z.string().max(800),
  pendingActions: z.array(z.string().max(160)).max(8),
});
```

### 6.5 MOD-45: Closure notes draft (LLM)

**Draft notes** in the **Resolve & Close** dialog drafts `resolution_notes` from the timeline, the `time_to_*` durations and the transport facts. `outcome`, `patient_disposition` and `follow_up_required` **stay manual selects**, because they feed analytics and must be human-attested.

```ts
export const ClosureDraftSchema = z.object({
  resolutionNotes: z.string().max(1000),
  followUpSuggestion: z.string().max(200).nullable(),   // a hint only; never ticks the checkbox
});
```

### 6.6 MOD-50: Weekly analytics narrative (LLM)

On Monday, after the nightly aggregation, send **aggregates only** (counts, medians, SLA %, week-over-week deltas, never rows) and get a short summary for MDRRMO and LGU meetings. It's shown with the "AI summary" label next to the numbers. Every number in the output must appear in the input, otherwise the row is stored as `FAILED`.

```ts
export const AnalyticsNarrativeSchema = z.object({
  headline: z.string().max(160),
  points: z.array(z.string().max(200)).min(2).max(6),
  watchItems: z.array(z.string().max(160)).max(3),
});
```

### 6.7 MOD-53: Announcement draft (LLM)

**Draft with AI** on the compose page: the publisher enters bullet facts, and the model returns the Mayor's Office template in Filipino and English, plus an SMS version ≤ 160 characters. Submit, approval and publish don't change. Announcements are public content, so this is the lowest-privacy-risk LLM use. Check in code that every phone number in the output appears in the input facts, and drop the draft if one doesn't.

```ts
const Lang = z.object({ title: z.string().max(120), body: z.string().max(2000), summary: z.string().max(400), actionRequired: z.string().max(300) });
export const AnnouncementDraftSchema = z.object({
  fil: Lang,
  en: Lang,
  sms: z.string().max(160),
  suggestedSeverity: z.enum(['INFORMATIONAL', 'ADVISORY', 'WARNING', 'CRITICAL']), // announcement_severity
});
```

---

## 7. Rollout

| Phase | Scope | Depends on | Done when |
|---|---|---|---|
| R1 | **C1** responder push, **C3** STOP processing | — | §4.1 and §4.3 "Done when" pass |
| R2 | **C2** surge recommendation + live triage tags | MDRRMO thresholds | §4.2 "Done when" passes |
| R3 | AI foundation (§5 = AI plan Phase 0 + 1) | DPO sign-off on the data table | AI plan Phase 1 checklist passes |
| R4 | **C4** barangay replies (AI plan Phase 2) | R3, reply fixtures | AI plan Phase 2 checklist passes |
| R5 | **C5** heartbeat, **C6** hospital ranking | — | Stale unit drops in ranking with a reason; ranking shows reasons |
| R6 | **C7** hotspots, **C8** registry freshness | — | Admin approves a proposal through the audited path |
| R7 | Optional assists (§6), one at a time | R3 for LLM ones | Each works identically with AI off |

R1, R2, R5 and R6 need no LLM and can run in parallel with R3–R4.

---

## 8. Testing

Put the tests in `backend/test/<module>/` and `backend/test/ai-assist/`, following the existing Jest specs (`npx jest --config ./test/jest.config.ts <path>`).

- **Rules (C1–C3, C5–C8):** unit tests per rule with Prisma mocked. A failed push, SMS or job leaves the incident and dispatch unchanged.
- **LLM:** inject a fake `AiClientService`; CI never calls OpenAI. An opt-in eval script runs the fixtures against the real API using the key in `backend/.env`.
- **Off means off:** with `AI_ASSIST_ENABLED=false`, no job is queued and no client is created.
- **Privacy:** snapshot the exact prompt input for a seeded incident containing a reporter name, a phone number in the description, a patient and a medical profile, and assert that none of them appear.
- **Regression:** the emergency-flow E2E suite must pass after each phase (CLAUDE.md).

The `tests/` package currently fails because of duplicate `@nestjs/*` copies, and `emergency-alerts.service.spec.ts` needs an `OpsAlertService` provider (2026-10-29 code check). Fix that before adding cross-package tests there.

---

## 9. Open decisions

1. **Names in free-text descriptions** ("si Juan ay nahulog") can't be reliably redacted. The DPO accepts that for the case brief (§6.1), or the brief sends only category, caller answers and hazard flags. C4 isn't affected: it sends only the barangay's reply text.
2. **Surge thresholds** (C2) need MDRRMO numbers. The values above are placeholders.
3. **Typhoon-time AI:** v1 uses OpenAI with the existing key. A `baseURL` override in `AiClientService` keeps the local-model (Ollama) option open.
4. **Auto-applying barangay replies:** no. It stays one tap by a dispatcher at any confidence (Rule 8).
5. **Key handling:** the key lives only in `backend/.env` (git-ignored) and the production secret store. Rotate it if it's ever pasted into chat, a ticket or a commit.
