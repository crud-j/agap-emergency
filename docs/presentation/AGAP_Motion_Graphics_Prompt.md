# Prompt: build the AGAP product video in Remotion

Start a new Claude Code session at the repo root (`agap-emergency`) and send:

> Read @docs/presentation/AGAP_Motion_Graphics_Prompt.md and follow it. Run all phases, 1 to 4, without stopping.

If the session ends before the video is done, start a fresh one (`/clear`) and send:

> Read @docs/presentation/AGAP_Motion_Graphics_Prompt.md and @promo/PROGRESS.md, then continue from where PROGRESS.md says it stopped, through to the end.

---

Build the **AGAP Product Presentation and System Demonstration** video in the Remotion project at `promo/`. It is a graded class deliverable. Work through all four phases in one run without waiting for my review between them. Only stop early if something blocks you completely; otherwise make a sensible choice, record it in `promo/PROGRESS.md`, and keep going.

## Before you start

1. Load the `remotion-best-practices` skill (it routes to the other Remotion skills in `promo/.claude/skills`). Follow it for the APIs, and check the docs with `remotion-docs` instead of guessing; the project is on Remotion **4.0.544**.
2. Read these files:
   - `promo/voiceover/script.json`: the narration, 38 lines. Each has `id`, `section`, `text`, and a `visual` note naming the clip and timestamps to show under it. **This is the storyboard.**
   - `promo/src/voiceover-manifest.ts`: the generated audio file and exact duration of each line. Never edit it; it is rewritten by `npm run voiceover`.
   - `docs/presentation/AGAP_Screen_Recording_Shot_List.md`: what each recording shows and section 11 (what is animated rather than recorded).
   - `CLAUDE.md`: what AGAP is and the rules the video must not contradict.
3. Do not run `npm run voiceover` unless I ask; the audio is final until I change the script.

## Graded requirements (all must be visibly covered)

- **A. How the system works:** purpose, the problem, the workflow from input to output, how users interact.
- **B. Automation implemented:** which tasks are automated, how, how it saves time and reduces errors, real examples.
- **C. System features and functionalities:** major modules, real screen recordings, how each helps users, dashboards and reports.
- **D. Uniqueness and innovation:** compared with traditional (hotline-only) reporting, innovations, advantages, why users benefit.
- Real recordings of the working system; animations, effects and professional transitions; AI voice-over that is clear and **synchronized with the visuals**; background music that never overpowers the narration; only functionality that is actually implemented.

## Assets

| What | Where |
|---|---|
| Narration audio | `promo/public/voiceover/<id>.wav` (24 kHz mono), durations in `src/voiceover-manifest.ts` |
| Recordings | `promo/public/screen-records/AGAP-SCREEN-RECORDS/{ALDRIN,CHRISTIAN,JHOBERT}/` |
| Logo | `frontend/public/agap-mark.svg`, `agap-svg-icon.svg`, `agap-solo-icon.png` (copy into `promo/public/brand/`) |
| Map and role icons | `frontend/public/map-icons`, `responders-map-icons`, `male-female-citizen-icons` |
| Music | **None yet.** Build the music track with a placeholder path `public/music/bed.mp3` behind a flag so the video renders without it, and tell me when you need the file. |

Recording formats, so you can frame them:

- Phone, portrait 1080×2460: everything in `JHOBERT/`, and `CHRISTIAN/SHOT63.mp4`. Phone, portrait 576×1312: `ALDRIN/SHOT-45.mp4`, `SHOT-58.mp4`. Show these inside a simple drawn phone frame.
- Web, about 1920×944 (`ALDRIN/`) and 1918×1022 (`CHRISTIAN/`); `CHRISTIAN/SHOT62.mp4` is 1012×964. Show these inside a simple drawn browser frame. Zoom and pan into the part of the screen the narration is talking about, because the full UI is too small to read at 1080p.
- Jhobert's clips are long, combined takes (up to 4.5 min). Always trim to the timestamps in the `visual` notes.

## Video spec

- 1920×1080, 30 fps, one main composition `AgapProductVideo`, plus one composition per section (`SectionA` … `SectionD`) so each can be previewed alone.
- The timeline is driven by the manifest: each narration line is one scene, its length is the line's duration in frames plus a short pause (about 0.4 s). Do not hard-code durations; if I regenerate a line, the video must re-time itself.
- Narration at full volume. Music at about 15 percent, lower still while narration plays, fading in at the start and out at the end.
- Section title cards between sections (A, B, C, D) with a transition from `@remotion/transitions`.
- Lower-thirds naming the feature on screen (for example "Live Dispatch", "Response Targets (SLA)", "Risk Map"). Use feature names, not module numbers.
- Optional, if time allows: on-screen captions built from each line's `text`.

## Look and feel

Match the AGAP apps so the animation and the recordings feel like one product.

- Colors: green `#0D6053` (primary), bright green `#17917C`, deep green `#12362F`, soft green `#EEF7F4`, pearl `#EFF3F7`, text `#0F1C2D` / `#3D5166` / `#7A8FA3`, danger red `#CF3B4E` (SOS, critical), amber `#C96A00` (warnings), info blue `#2563EB`.
- Font: IBM Plex Sans (and IBM Plex Mono for reference numbers and SMS text), loaded with `@remotion/google-fonts`.
- Calm, clean, civic: smooth eased motion, no flashy glitch effects. Emergency moments (SOS, escalation) may use the red with a pulse.
- Use generic shapes and icons for partner agencies and hospitals; no official logos other than AGAP's.

## Animated scenes to design (from the `visual` notes)

- **a-01 to a-04:** the Bocaue intro (map, river rising, fireworks area, highway), four problem cards, AGAP logo reveal with the four user groups around one incident card, and the lifecycle diagram (Report > Locate > Validate > Dispatch > Respond > Coordinate > Close).
- **a-10:** split screen, responder map next to the citizen's tracking screen.
- **b-02:** an SMS bubble going from the server to the MDRRMO phone, in this exact format: `AGAP|INC-2026-000057|14.8130,120.9305|1794745440|ROAD_ACCIDENT|C:Y`, then an SMS to emergency contacts.
- **b-03:** the SMS fallback path (phone without data > SMS > server creates the incident > reference texted back). Never show a real messages app; draw it. `CHRISTIAN/SHOT63.mp4` will be re-recorded; use a labelled placeholder until then.
- **b-05:** a response-target timer running out and turning into an escalation, before `SHOT-47`.
- **b-06:** the push notification banners and an ETA chip labelled "estimate".
- **b-10, d-01:** before/after and "Hotline only vs With AGAP" comparisons.
- **c-01:** the ten module areas as a grid.
- **d-02 to d-05, z-01:** innovation tiles, nine roles around one record, the Bocaue map with EN/FIL, benefit cards, logo and closing tagline.

## Must hide (blur or crop; never show these frames unblurred)

| Clip | Time | What |
|---|---|---|
| `CHRISTIAN/SHOT62.mp4` | about 0:08–0:15, and the bottom of the page | Authenticator QR code and setup key; session IP address |
| `JHOBERT/CITIZEN APP_ onboarding and account.mp4` | 1:05–1:13 | A real PhilHealth ID card |
| same | 1:21–2:45 | Email, phone number and **plain-text password** |
| same | 4:25–4:29 | Phone number typed on the login screen |
| `JHOBERT/2 CITIZENS APP_ home and readiness 1.mp4` | 0:25–0:45 | Contact phone numbers |
| `JHOBERT/responder app_ BFP ACCOUNT.mp4` | 0:21–0:29 | Password |
| `CHRISTIAN/SHOT26_dashboard.mp4`, `SHOT60.mp4`, `SHOT61.mp4` | bottom-left corner | A `trycloudflare.com` link |
| `JHOBERT/Responder app_ Flow.mp4` | 0:49–1:09 | Unrealistic vital signs; skip these frames |

Also blur the citizen's name in the home-screen greeting ("Emiliana …") wherever it is readable; it is a real person's name. Note in `PROGRESS.md` where you blurred it, so I can undo that later if I decide to show it.

## Rules the video must keep

- The recordings follow different incidents (the citizen's SOS, the web dispatch and the responder clip have different reference numbers). Do not zoom in on reference numbers in a way that claims they are the same incident.
- ETA is always labelled as an estimate. The system suggests; the dispatcher decides. AGAP complements 911 and the MDRRMO hotlines.
- Only show features that exist in the recordings or in `CLAUDE.md`; do not invent UI.

## Phases

Run these in order, one after the other, without stopping between them:

1. **Scaffold.** Compositions, manifest-driven timeline with every line as a placeholder scene (line id, section and `text` on screen), narration audio playing, music slot, phone and browser frame components, a reusable blur-region component, lower-third and section-title components, brand tokens in one file.
2. **Section A** fully built.
3. **Section B**, then **C**, then **D** and the closing, fully built.
4. **Polish and render.** Check timing and transitions across the whole video, then render it to `promo/out/agap-product-video.mp4`. My laptop has 8 GB RAM, so render with low concurrency (start with `--concurrency=2`), and run the render as a background command.

At the end of every phase, before moving on:

- Run `npm run lint` from `promo/` and fix any errors.
- Render a few still frames of the new scenes (`npx remotion still`) and look at them, to catch layout problems, unreadable text, and anything from the "Must hide" list that is still visible.
- Update `promo/PROGRESS.md`.

Keep scenes in separate files under `promo/src/scenes/` and shared pieces under `promo/src/components/`. When everything is done, tell me what you built, what you could not do, any choices you made on my behalf, and what you need from me (at least the music file and the re-recorded `SHOT63`).

Keep `promo/PROGRESS.md` up to date at the end of every phase: which phases and scenes are done, decisions I made (for example the blur choices), open issues, and the next step. A new session will continue from that file, so write it for someone who has not seen this conversation.

After Phase 1, start Remotion Studio with `npm run dev` from `promo/` as a background command and give me the local URL, so I can watch progress in my browser while you keep working.
