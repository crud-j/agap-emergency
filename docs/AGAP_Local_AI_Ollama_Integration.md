# AGAP — Local AI Integration with Ollama
## AppBuildersPH Hackathon 2026 · Local AI Theme

**Created:** 2026-10-09  
**Context:** AppBuildersPH Hackathon 2026 — Theme: *"Build an AI product that remains genuinely useful when the cloud disappears."*

---

## Why AGAP is the perfect Local AI story

The hackathon's core challenge is: **useful AI when the cloud disappears.**

AGAP is an emergency response system for Bocaue, Bulacan — a municipality that experiences exactly this scenario during every typhoon season. During Typhoon events, Bocaue River exceeds 11.50m critical level, the four flood-prone barangays (Lolomboy, Bunlo, Igulot, Bambang) lose mobile data connectivity, and the MDRRMO operations center may lose its internet uplink entirely.

This is not a theoretical edge case. This is the mission. Dispatchers need to manage 20+ simultaneous flood incidents, prioritize which barangays to reach first, draft evacuation announcements, and coordinate BFP resources — **all while the cloud is unreachable.**

AGAP already has an offline queue for mobile submissions. Adding local AI to the **operations center server** (which has power and a LAN even when internet is down) means the AI assistance that dispatchers rely on continues working exactly when they need it most.

**Hackathon judging alignment:**

| Criterion | Weight | AGAP + Local AI fit |
|-----------|--------|---------------------|
| Problem & Usefulness | 25% | Life-safety emergency dispatch — clear, urgent, real |
| Local AI Implementation | 25% | Ollama on ops center server, works with zero internet |
| Technical Execution | 20% | NestJS service, demo-able live dispatch flow |
| Innovation | 15% | Local AI in a government emergency system in PH — novel |
| Product & Demo Quality | 15% | Live incident → AI triage → dispatch flow on screen |

---

## Recommended Ollama Models

### Primary: `llama3.2:3b` (top pick)

```bash
ollama pull llama3.2:3b
```

| Property | Value |
|----------|-------|
| Size | ~2.0 GB |
| RAM needed | 4 GB |
| GPU required | No — runs on CPU |
| Speed | ~15–25 tok/s on modern CPU |
| Strengths | Instruction following, structured output, Filipino/English |
| Best for | Triage reasoning, announcement drafting, dispatch narratives |

**Why this one:** Runs on the MDRRMO ops center PC (no GPU needed), fast enough for real-time dispatch assistance, handles Taglish mixed language well, and produces coherent structured output.

### Alternative: `phi3:mini` (if lower RAM)

```bash
ollama pull phi3:mini
```

| Property | Value |
|----------|-------|
| Size | ~2.2 GB |
| RAM needed | 3.5 GB |
| GPU required | No |
| Speed | ~20–30 tok/s on CPU |
| Strengths | Extremely good at structured/JSON output, compact |
| Best for | JSON extraction from incident text, constrained hardware |

### Upgrade: `mistral:7b` (if GPU available)

```bash
ollama pull mistral:7b
```

| Property | Value |
|----------|-------|
| Size | ~4.1 GB |
| RAM needed | 8 GB |
| GPU | Optional but recommended |
| Strengths | Better reasoning chains, more natural language |
| Best for | Complex multi-incident prioritization narratives |

### Embeddings: `nomic-embed-text` (for RAG use case)

```bash
ollama pull nomic-embed-text
```

| Property | Value |
|----------|-------|
| Size | ~274 MB |
| Purpose | Semantic search over historical incident data |
| Best for | RAG on Bocaue flood records, risk pattern matching |

---

## Integration Points — Ranked by Hackathon Impact

### 1. AI Triage & Priority Reasoning (MOD-24/25) — HIGHEST IMPACT

**Why #1:** This is the most visible integration. The dispatcher sees AI reasoning on screen during the live demo. It directly augments the dispatch flow that judges will watch. It satisfies "local inference is fundamental" because the priority recommendation becomes richer and more explainable than the current rule-based system — and it still works when the internet is down.

**Current state:** `backend/src/dispatch/resource-matching/resource-matching.service.ts` returns a ranked unit list with a static `rationale` string. MOD-24's `getPriorityRecommendation()` in `dispatch.service.ts` returns the current priority unchanged with a fixed note.

**What to build:** A new `OllamaService` + `AiTriageService` that, given an incident, produces:
- A natural-language reasoning paragraph explaining priority assessment
- Flood context injection (is this barangay flood-prone? is river level critical?)
- A confidence score
- A recommended dispatch narrative ("Deploy BFP Unit 2 first — Lolomboy has highest flood risk and Unit 2 has water rescue capability")

**Files to create/modify:**

```
backend/src/ai/
├── ollama.service.ts          ← HTTP client for Ollama API
├── ai-triage.service.ts       ← MOD-24/25 triage reasoning
├── ai-announcement.service.ts ← MOD-53 announcement drafting
└── ai.module.ts               ← @Global() module
```

**Modify:**
- `backend/src/dispatch/dispatch.service.ts` — call `AiTriageService` in `getPriorityRecommendation()`
- `frontend/app/(ops)/operations/dispatch/page.tsx` — show AI reasoning panel
- `frontend/features/dispatch/api.ts` — add `aiReasoning` field to `PriorityRecommendation`

**AGAP guardrail compliance:**
- AI recommendation is **assistive only** — dispatcher still clicks "Confirm Dispatch" (CLAUDE.md rule 8)
- AI failure never blocks dispatch — `try/catch` wraps all Ollama calls, falls back to rule-based output
- No PII sent to model — only category, barangay, priority, river level, capability match

---

### 2. AI-Assisted Announcement Drafting (MOD-53) — HIGH IMPACT

**Why #2:** During a flood surge, the Announcements Publisher needs to draft evacuation notices fast. A local LLM that generates a draft announcement from structured data (category, affected barangays, river level, time) is a compelling demo moment. The broadcaster reviews and edits before publishing — one-way broadcast, never dispatch channel (CLAUDE.md rule 16).

**Current state:** `frontend/app/(ops)/announcements/page.tsx` has a compose/publish form. The dispatcher types manually.

**What to build:** An "AI Draft" button in the announcement composer that calls `POST /ai/draft-announcement` → Ollama → returns a Filipino/English bilingual draft. User edits then publishes.

**Example prompt to Ollama:**
```
You are the MDRRMO Bocaue public announcement system.
Generate a short emergency announcement in Filipino and English.
Incident: FLOOD in Lolomboy, Bambang
River level: 11.8m (above 11.5m critical threshold)
Time: 2:30 PM October 9, 2026
Keep it under 160 words. Start with "ALERTO:" in Filipino.
```

**Files to create/modify:**
- `backend/src/ai/ai-announcement.service.ts` — draft generation
- `backend/src/announcements/announcements.controller.ts` — add `POST /announcements/ai-draft`
- `frontend/app/(ops)/announcements/page.tsx` — "AI Draft" button next to compose form

---

### 3. Incident Description Parsing — MEDIUM IMPACT

**Why #3:** Mobile SOS submissions often include free-text descriptions like "May nahulog sa ilog malapit sa tulay Bambang" (Someone fell into the river near Bambang bridge). A local LLM can extract: location hint → Bambang, category hint → RESCUE, patient count → 1.

**What to build:** On `POST /alerts` or `POST /incidents`, optionally call `AiParseService` to enrich the incident record with extracted hints before saving. These are hints only — never overwrite user input, never block submission.

**Files to create/modify:**
- `backend/src/ai/ai-parse.service.ts`
- `backend/src/emergency-alerts/emergency-alerts.service.ts` — optional enrich call after persist

---

### 4. Risk Intelligence RAG (MOD-51) — MEDIUM IMPACT

**Why #4:** Using `nomic-embed-text` embeddings + pgvector (PostGIS already installed), create a RAG system over Bocaue's historical flood incident data. The dispatcher can ask: "How bad was the last flood in Bunlo?" and get a grounded answer from local records — no internet required.

**What to build:**
- Embed historical incidents at seed time using `nomic-embed-text`
- Add `POST /risk-intelligence/ask` endpoint: embeds query → finds similar past incidents → passes to LLM for synthesis
- Add a small "Ask AI" panel to the risk page

---

## Architecture

```
MDRRMO Operations Center (LAN, no internet needed)
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────────┐    HTTP    ┌──────────────────────┐  │
│  │   NestJS     │◄──────────►│   Ollama Server      │  │
│  │   Backend    │  :11434   │   llama3.2:3b         │  │
│  │   :3000      │            │   nomic-embed-text    │  │
│  └──────┬───────┘            └──────────────────────┘  │
│         │                                               │
│         │ WebSocket                                     │
│  ┌──────▼───────┐                                      │
│  │  Next.js     │                                      │
│  │  OPS Center  │  ← Dispatcher sees AI reasoning      │
│  │  :3001       │    panel in real time                 │
│  └──────────────┘                                      │
│                                                         │
│  PostgreSQL (PostGIS) + Redis — all local              │
└─────────────────────────────────────────────────────────┘

Mobile citizens submit SOS → backend persists → AI enriches
→ Dispatcher sees enhanced triage → Confirms dispatch
→ All of this works with ZERO internet
```

---

## Implementation Guide

### Step 1 — Install and run Ollama

```bash
# Windows: download from ollama.com, then:
ollama serve   # starts on http://localhost:11434

# Pull the models
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

Add to `backend/.env`:
```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_TIMEOUT_MS=15000
AI_ENABLED=true
```

Add to `backend/src/config/config.validation.ts` (all optional — AI gracefully disabled if absent):
```typescript
@IsString()
@IsOptional()
OLLAMA_BASE_URL: string = 'http://localhost:11434';

@IsString()
@IsOptional()
OLLAMA_MODEL: string = 'llama3.2:3b';

@IsBoolean()
@IsOptional()
AI_ENABLED: boolean = false;
```

---

### Step 2 — `OllamaService` (the HTTP client)

**`backend/src/ai/ollama.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

interface OllamaEmbedResponse {
  embedding: number[];
}

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly embedModel: string;
  private readonly timeoutMs: number;
  readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.model = config.get('OLLAMA_MODEL', 'llama3.2:3b');
    this.embedModel = config.get('OLLAMA_EMBED_MODEL', 'nomic-embed-text');
    this.timeoutMs = config.get('OLLAMA_TIMEOUT_MS', 15000);
    this.enabled = config.get('AI_ENABLED', false);
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.enabled) return '';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          system: systemPrompt,
          stream: false,
          options: { temperature: 0.3, num_predict: 512 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = await res.json() as OllamaGenerateResponse;
      return data.response?.trim() ?? '';
    } catch (err) {
      // AI failure must never block operations — log and return empty
      this.logger.warn(`Ollama generate failed: ${String(err)}`);
      return '';
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.enabled) return [];
    try {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.embedModel, prompt: text }),
      });
      if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);
      const data = await res.json() as OllamaEmbedResponse;
      return data.embedding ?? [];
    } catch (err) {
      this.logger.warn(`Ollama embed failed: ${String(err)}`);
      return [];
    }
  }

  async isReady(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
```

---

### Step 3 — `AiTriageService` (MOD-24/25 enhancement)

**`backend/src/ai/ai-triage.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { OllamaService } from './ollama.service';

const FLOOD_BARANGAYS = new Set(['Lolomboy', 'Bunlo', 'Igulot', 'Bambang']);
const INDUSTRIAL_BARANGAYS = new Set(['Bundukan', 'Biñang 1st']);

export interface AiTriageResult {
  reasoning: string;           // Natural language explanation
  suggestedPriority: string;   // CRITICAL | HIGH | MEDIUM | LOW
  dispatchNarrative: string;   // "Deploy X first because..."
  confidenceNote: string;      // "Assistive — dispatcher confirms"
  generatedByAi: boolean;
}

const SYSTEM_PROMPT = `You are an AI assistant for the Bocaue MDRRMO (Municipal Disaster Risk Reduction and Management Office) 
Emergency Operations Center, Bocaue, Bulacan, Philippines.
Your role is to help dispatchers assess incident priority and suggest dispatch actions.
You are ASSISTIVE ONLY. The dispatcher always makes the final decision.
Be concise. Respond in English. Keep reasoning under 100 words.
Output valid JSON only.`;

@Injectable()
export class AiTriageService {
  constructor(private readonly ollama: OllamaService) {}

  async assessIncident(incident: {
    category: string;
    description: string | null;
    priority: string;
    barangay: string | null;
    numberOfPatients: number | null;
    bocaueRiverLevelM?: number | null;
  }): Promise<AiTriageResult> {
    const fallback: AiTriageResult = {
      reasoning: 'AI assessment unavailable — rule-based priority applied.',
      suggestedPriority: incident.priority,
      dispatchNarrative: 'Dispatch the highest-capability available unit.',
      confidenceNote: 'Assistive — dispatcher confirms.',
      generatedByAi: false,
    };

    if (!this.ollama.enabled) return fallback;

    const floodRisk = incident.barangay && FLOOD_BARANGAYS.has(incident.barangay)
      ? `FLOOD-PRONE barangay (confirmed degraded connectivity during typhoons)`
      : 'standard barangay';

    const industrialRisk = incident.barangay && INDUSTRIAL_BARANGAYS.has(incident.barangay)
      ? `INDUSTRIAL/FIREWORKS barangay (explosion/fire risk)`
      : null;

    const riverContext = incident.bocaueRiverLevelM
      ? `Bocaue River current level: ${incident.bocaueRiverLevelM}m (critical: 11.50m)`
      : '';

    const prompt = `
Assess this emergency incident and respond with JSON only.

INCIDENT:
- Category: ${incident.category}
- Current priority: ${incident.priority}
- Barangay: ${incident.barangay ?? 'Unknown'} — ${floodRisk}${industrialRisk ? ` | ${industrialRisk}` : ''}
- Number of patients: ${incident.numberOfPatients ?? 'Unknown'}
- Description: "${incident.description ?? 'No description'}"
${riverContext ? `- ${riverContext}` : ''}

Respond with this JSON structure:
{
  "reasoning": "<1-2 sentences explaining priority assessment>",
  "suggestedPriority": "<CRITICAL|HIGH|MEDIUM|LOW>",
  "dispatchNarrative": "<1 sentence: what unit to send and why>",
  "confidenceNote": "Assistive — dispatcher confirms."
}
`;

    const raw = await this.ollama.generate(prompt, SYSTEM_PROMPT);
    if (!raw) return fallback;

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return fallback;
      const parsed = JSON.parse(jsonMatch[0]) as Partial<AiTriageResult>;
      return {
        reasoning: parsed.reasoning ?? fallback.reasoning,
        suggestedPriority: parsed.suggestedPriority ?? incident.priority,
        dispatchNarrative: parsed.dispatchNarrative ?? fallback.dispatchNarrative,
        confidenceNote: 'Assistive — dispatcher confirms.',
        generatedByAi: true,
      };
    } catch {
      return fallback;
    }
  }
}
```

---

### Step 4 — `AiAnnouncementService` (MOD-53 enhancement)

**`backend/src/ai/ai-announcement.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { OllamaService } from './ollama.service';

@Injectable()
export class AiAnnouncementService {
  constructor(private readonly ollama: OllamaService) {}

  async draftAnnouncement(params: {
    category: string;
    affectedBarangays: string[];
    riverLevelM?: number | null;
    severity: string;
  }): Promise<{ draft: string; generatedByAi: boolean }> {
    if (!this.ollama.enabled) {
      return { draft: '', generatedByAi: false };
    }

    const barangays = params.affectedBarangays.join(', ') || 'affected areas';
    const riverNote = params.riverLevelM
      ? `Bocaue River: ${params.riverLevelM}m (critical level: 11.50m).`
      : '';

    const prompt = `
You are drafting an official emergency announcement for the Bocaue MDRRMO.
Write a bilingual (Filipino then English) emergency announcement.

Incident type: ${params.category}
Severity: ${params.severity}
Affected barangays: ${barangays}
${riverNote}

Requirements:
- Start with "ALERTO — MDRRMO BOCAUE:" in Filipino
- Include an English translation below
- Recommend evacuation if severity is HIGH or CRITICAL
- Mention the 911 and MDRRMO hotline at the end
- Maximum 120 words total
- Do not invent specific details not given above
`;

    const draft = await this.ollama.generate(prompt);
    return { draft: draft || '', generatedByAi: !!draft };
  }
}
```

---

### Step 5 — `AiModule`

**`backend/src/ai/ai.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { AiTriageService } from './ai-triage.service';
import { AiAnnouncementService } from './ai-announcement.service';

@Global()
@Module({
  providers: [OllamaService, AiTriageService, AiAnnouncementService],
  exports: [OllamaService, AiTriageService, AiAnnouncementService],
})
export class AiModule {}
```

Add to `backend/src/app.module.ts` imports array:
```typescript
import { AiModule } from './ai/ai.module';
// ...
AiModule,
```

---

### Step 6 — Wire into Dispatch service (MOD-24)

**`backend/src/dispatch/dispatch.service.ts`** — update `getPriorityRecommendation()`:

```typescript
// Add to constructor:
private readonly aiTriage: AiTriageService,

// Update method:
async getPriorityRecommendation(incidentId: string) {
  const incident = await this.prisma.incident.findUnique({
    where: { id: incidentId },
    include: { incident_locations: true },
  });
  if (!incident) throw new NotFoundException('Incident not found');

  const aiResult = await this.aiTriage.assessIncident({
    category: incident.category,
    description: incident.description,
    priority: incident.priority,
    barangay: incident.incident_locations?.barangay ?? null,
    numberOfPatients: incident.number_of_patients,
  });

  return {
    incidentId,
    currentPriority: incident.priority,
    recommendedPriority: aiResult.suggestedPriority || incident.priority,
    note: aiResult.confidenceNote,
    aiReasoning: aiResult.reasoning,
    dispatchNarrative: aiResult.dispatchNarrative,
    generatedByAi: aiResult.generatedByAi,
  };
}
```

---

### Step 7 — Announce AI draft endpoint (MOD-53)

**`backend/src/announcements/announcements.controller.ts`** — add:

```typescript
@Post('ai-draft')
@Roles(UserRole.SUPERVISOR, UserRole.ANNOUNCEMENTS_PUBLISHER)
@ApiOperation({ summary: 'Generate a draft announcement using local AI (Ollama)' })
async aiDraft(
  @Body() dto: { category: string; affectedBarangays: string[]; riverLevelM?: number; severity: string },
) {
  return this.aiAnnouncementService.draftAnnouncement(dto);
}
```

---

### Step 8 — Frontend: Show AI reasoning in Dispatch page

**`frontend/features/dispatch/api.ts`** — update `PriorityRecommendation`:

```typescript
export interface PriorityRecommendation {
  incidentId: string;
  currentPriority: string;
  recommendedPriority: string;
  note: string;
  // New AI fields:
  aiReasoning?: string;
  dispatchNarrative?: string;
  generatedByAi?: boolean;
}
```

**`frontend/components/incidents/IncidentDetailDrawer.tsx`** — update `PriorityRecommendationChip`:

```tsx
function PriorityRecommendationChip({ incidentId, currentPriority }) {
  const { data } = usePriorityRecommendation(incidentId);
  if (!data) return null;

  return (
    <div className="rounded-xl border border-agap-infoSoft bg-agap-infoSoft/60 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-agap-info shrink-0" />
        <span className="text-sm font-semibold text-agap-textMain">
          AI Priority: <PriorityBadge priority={data.recommendedPriority} />
        </span>
        {data.generatedByAi && (
          <span className="text-[10px] bg-agap-green/10 text-agap-green px-1.5 py-0.5 rounded-full font-mono">
            local AI · offline-capable
          </span>
        )}
      </div>
      {data.aiReasoning && (
        <p className="text-xs text-agap-textMid ml-6">{data.aiReasoning}</p>
      )}
      {data.dispatchNarrative && (
        <p className="text-xs text-agap-green ml-6 font-medium">{data.dispatchNarrative}</p>
      )}
      <p className="text-[11px] text-agap-textSub ml-6">{data.note}</p>
    </div>
  );
}
```

---

## AGAP Guardrails — AI Compliance

All integrations must honor `CLAUDE.md` rules:

| Rule | How AI integration complies |
|------|----------------------------|
| Dispatch is assistive, never autonomous | `AiTriageService` returns reasoning only; dispatcher confirms |
| Failed notifications must never affect incidents | AI failure returns fallback — never throws into request path |
| PostgreSQL is source of truth | AI outputs are display-only; DB is never written from AI output alone |
| No autonomous dispatch | No code path dispatches based on AI output without `dispatcherId` |
| Audit all consequential actions | AI-assisted dispatch still logs the dispatcher's `actorId`, not the model |
| MOD-53 is one-way broadcast only | AI draft is a text suggestion; publisher still manually triggers publish |
| Offline queue still works | AI layer is additive; existing SOS → queue → persist flow unchanged |

---

## Docker Compose — Add Ollama service

Add to `docker-compose.yml` for local dev:

```yaml
  ollama:
    image: ollama/ollama:latest
    container_name: agap_ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    # GPU support (optional):
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]

volumes:
  ollama_data:
```

After starting: `docker exec agap_ollama ollama pull llama3.2:3b`

---

## `.env.example` additions

```env
# --- Local AI (Ollama) ---
# Set AI_ENABLED=true and start Ollama to activate local AI features.
# All AI features degrade gracefully when Ollama is unavailable.
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_TIMEOUT_MS=15000
AI_ENABLED=false
```

---

## Demo Narrative for Judges (5-minute pitch)

> "During Typhoon Carina, Bocaue River reached 11.8 meters — above the 11.5m mandatory evacuation threshold. Cell towers in Lolomboy and Bambang are overwhelmed. The MDRRMO ops center has lost its internet uplink. The cloud is gone.
>
> Watch: a citizen SOS comes in from Bambang. AGAP's local AI — running entirely on this ops center PC with no internet — reads the incident description, recognizes Bambang as a flood-prone barangay, sees the river level, and tells the dispatcher: *'HIGH priority. Deploy water rescue unit first — Bambang is flood-prone and Unit 3 has water rescue certification.'*
>
> The dispatcher reads the reasoning, confirms with one click. The responder gets the assignment. The citizen gets a status update. All of this happened on a local server with zero cloud dependency.
>
> This is what Local AI means for disaster response."

---

## Hackathon Submission Disclosures

Per the hackathon rules (all models and tools must be disclosed):

**Models used:**
- `llama3.2:3b` — Meta, Apache 2.0 license, via Ollama
- `nomic-embed-text` — Nomic AI, Apache 2.0 license, via Ollama

**What runs locally:**
- Ollama inference server on ops center machine
- NestJS backend, PostgreSQL, Redis (all local)
- Full dispatch flow, triage AI, announcement drafting

**What requires internet:**
- Initial `ollama pull` to download models (one-time setup)
- Textbee SMS gateway (secondary channel, not required for dispatch)
- Firebase push notifications (secondary, not required for dispatch)

**Why this product benefits from running AI locally:**
> AGAP serves Bocaue during typhoon events when internet is degraded or lost entirely. The dispatcher AI assistant — which helps triage 20+ simultaneous flood incidents and generate bilingual evacuation announcements — must work exactly when the disaster is worst. Local inference via Ollama ensures AI-assisted dispatch continues even when the cloud disappears.

---

## Implementation Priority (24-hour hackathon timeline)

| Hour | Task |
|------|------|
| 0–2 | Install Ollama, pull `llama3.2:3b`, verify API works |
| 2–4 | Build `OllamaService` + `AiModule` + `.env` config |
| 4–6 | Build `AiTriageService`, wire into `getPriorityRecommendation()` |
| 6–8 | Update frontend `PriorityRecommendationChip` to show AI reasoning |
| 8–10 | Build `AiAnnouncementService` + endpoint + frontend "AI Draft" button |
| 10–12 | Add Ollama to docker-compose, test full offline flow (pull LAN cable) |
| 12+ | Polish demo, record 1-minute video showing offline AI in action |
