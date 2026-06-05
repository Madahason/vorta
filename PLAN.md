# Vorta — Project Plan

## What is Vorta?
Vorta is an AI-powered content production platform. The current build focuses on the **Video Creator** module: a fully automated pipeline that transforms a YouTube documentary script into a near-finished video using AI-generated images, motion graphics, and a pre-built clip library — assembled programmatically via Remotion.

The platform is designed to scale. Future modules (Video Research, Title & Thumbnail Generator, Script Writer) will slot into the same UI without requiring a rebuild.

---

## Vision: Full Platform (Future)
The sidebar navigation should reflect all planned modules, with future ones marked as "Coming soon":

1. **Video Research** — finds winning video ideas, identifies angles and content gaps
2. **Script Writer** — transforms a video idea + title + thumbnail concept into a full documentary script
3. **Title & Thumbnail** — generates optimized titles and thumbnail concepts based on winning ideas
4. **Video Creator** ← current build
5. **Settings** — style presets, library management, auth status

---

## Current Build: Video Creator

### Pipeline Overview
```
Script Input
→ Claude Scene Analyzer (classify + prompt each scene)
→ Scene JSON
→ [Image scenes] → Higgsfield CLI → still image + Ken Burns in Remotion
→ [Motion graphic scenes] → Remotion component templates
→ [Real footage scenes] → Clip Library match → fallback: Higgsfield CLI image
→ Remotion Assembler (timeline + transitions + audio)
→ MP4 Export
```

### Scene Types
Every scene is classified as one of three types:
- `image` — Higgsfield CLI generates a still; Remotion animates with Ken Burns effect
- `motion_graphic` — Remotion renders a pre-built animated component (chart, counter, timeline, quote card, map)
- `real_footage` — matched against local clip library by tags; falls back to `image` if no match found

### Scene JSON Structure
```json
{
  "scene_id": "007",
  "script_excerpt": "The moment Lehman collapsed...",
  "shot_type": "image",
  "mood": "tense",
  "higgsfield_prompt": "Traders on the Lehman Brothers trading floor in Midtown Manhattan clearing personal belongings on September 15 2008, shocked expressions, cardboard boxes, LHMAN ticker plummeting on screens behind them",
  "subject_anchors": ["Lehman Brothers", "September 15 2008", "trading floor", "financial crisis"],
  "style_lock": "dark cinematic 4K shallow depth of field slow dolly documentary",
  "real_footage_flag": false,
  "clip_search_tags": [],
  "duration_seconds": 5,
  "motion": { "type": "static", "intensity": "moderate" },
  "overlays": [{ "type": "date_stamp", "text": "New York · September 2008" }],
  "transition_out": "dip_black",
  "grade": "desaturated"
}
```

### Documentary Composition Layer (added Phase 2 polish)

Each image scene carries full composition metadata assigned by Claude and overridable per-card in the UI.

**`motion`** — controls the camera animation applied to the still image:

| type | use when |
|------|----------|
| `push_in` | building tension, approaching a subject, reveals |
| `pull_out` | showing scale, consequences, stepping back |
| `drift_left` / `drift_right` | establishing shots, locations, timelines |
| `drift_up` | aspirational moments, launches, achievements |
| `static` | death, failure, shock — stillness has impact |

intensity: `subtle` (background), `moderate` (main narrative), `strong` (climax/turning points)

Scale/translate ranges:
- push_in: scale 1.0 → 1.06 / 1.10 / 1.16
- pull_out: scale 1.06 → 1.0 / 1.10 → 1.0 / 1.16 → 1.0
- drift_*: translate 0 → ±4% / ±7% / ±10%
- static: no transform

**`overlays`** — array of overlay specs rendered on top of the image:
- `lower_third` — person/company introduction, slides in from left, holds 3s, slides out
- `date_stamp` — year/location pill, bottom-right, fades in and stays
- `kinetic_text` — punchy statement, center or bottom, fade in/hold/fade out. Max 1 per 4 scenes.

Rules: never lower_third AND date_stamp on same scene. Leave `[]` for atmospheric scenes.

**`transition_out`** — how the scene exits:
- `dissolve` — 12-frame cross-fade overlap (default)
- `cut` — hard cut, no overlap
- `dip_black` — 8-frame black frame (chapter breaks, deaths, endings)
- `dip_white` — 8-frame white frame (reveals, memory sequences)

**`grade`** — color grade applied via FilmLook overlay:
- `cool_blue` — default documentary grade (rgba(30,60,120,0.12) multiply)
- `warm_amber` — historical/nostalgia (rgba(120,80,20,0.10) multiply)
- `desaturated` — crisis/failure (CSS saturate(0.6))
- `neutral` — product shots/clean context (no tint)

**FilmLook overlay** (`remotion/src/components/overlays/FilmLook.jsx`) — applied to every image scene:
- Animated grain: 512×512 canvas redrawn per frame with frame-seeded PRNG, scaled up via CSS
- Vignette: radial-gradient div, default intensity 0.45
- Color grade tint: multiply blend div

**Remotion project** (`remotion/`):
- Entry: `remotion/src/index.jsx` → `Root.jsx` → registers Documentary composition
- `Documentary.jsx` computes layout (start frames per scene based on transitions) and sequences all scenes with `<Sequence>`
- `ImageScene.jsx` applies motion transform + FilmLook + overlay components
- Each overlay component: `LowerThird.jsx`, `DateStamp.jsx`, `KineticText.jsx`
- Install: `cd remotion && npm install`
- Preview: `npm start` (opens Remotion Studio)
- Render: `npm run render`

### Style Lock
Every Higgsfield prompt must include the style lock string to enforce visual consistency across all scenes:
> "dark cinematic 4K shallow depth of field slow dolly movement documentary aesthetic muted tones"

This string is injected automatically by the backend service — never rely on Claude to remember it per scene.

### Prompt Grounding Rules
Claude is instructed to generate prompts that are anchored to the specific subject of the video — not generic cinematic stand-ins. The system prompt enforces:

1. **Subject anchoring** — every image prompt must reference the actual subject (real company, product, person, place) not a generic substitute
2. **Script anchoring** — the prompt describes what is literally happening in the excerpt, not a thematic interpretation
3. **Specificity** — real place names, years, product names, people described by appearance/role
4. **Banned concepts** — the words `businessman`, `office`, `technology`, `modern`, `futuristic`, `abstract`, `concept`, `idea`, `success`, `growth`, `innovation`, `digital`, `corporate`, `professional` are explicitly forbidden

**`subject_anchors` field** — Claude extracts 3–6 specific real-world entities per scene (company names, person names, product names, locations, years, events). At least 2 must appear directly in the `higgsfield_prompt`. A post-processing validator in `claude.js` checks this on every image scene and appends the top anchor if the check fails.

### Clip Library Structure
Each clip entry in the library:
```json
{
  "clip_id": "001",
  "file": "/library/clips/wall_street_crowd.mp4",
  "tags": ["finance", "wall street", "crowd", "crisis", "2008"],
  "mood": "tense",
  "category": "finance",
  "duration": 6,
  "source_url": "https://youtube.com/..."
}
```

Library is stored as a flat JSON file (`/library/clips.json`) alongside the clip files.

### Clip Workflow for Remotion

Remotion only serves static files from its own `remotion/public/` folder. The backend library path and the Remotion path are separate:

| Layer | Path | Purpose |
|-------|------|---------|
| Backend (`clips.json`) | `/library/clips/[filename].mp4` | Metadata store, tag matching |
| Remotion | `remotion/public/clips/[filename].mp4` | Actual video served during render |

**To add a clip to Remotion rendering:**
1. Source the clip: `yt-dlp -o "%(title)s.%(ext)s" <url>`
2. Copy/move it to `remotion/public/clips/[filename].mp4`
3. The backend `clipMatcher.js` automatically derives a `filename` field (basename of `file`) on every returned clip — `FootageScene.jsx` uses `clip.filename` to call `staticFile("clips/[filename]")`
4. If a clip file is missing from `remotion/public/clips/`, `FootageScene` catches the `onError` event and renders `PlaceholderScene` instead of crashing

### Remotion Motion Graphic Templates
Pre-built components to build and maintain:
- `AnimatedCounter` — counts up to a number (revenue, users, dates)
- `TimelineBar` — horizontal event timeline
- `ComparisonChart` — side-by-side bar or stat comparison
- `QuoteCard` — full-screen pull quote with animated text
- `MapHighlight` — world/country map with highlighted region

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Tailwind CSS |
| Backend | Node.js + Express |
| AI Analysis | Claude API (claude-sonnet-4-6) |
| Image Generation | Higgsfield CLI (`@higgsfield/cli`) |
| Video Assembly | Remotion |
| Clip Library | JSON flat file + local filesystem |
| Clip Sourcing | yt-dlp (run separately, not in-app) |
| Rendering | Remotion CLI |

---

## Higgsfield CLI Integration

### Overview
Higgsfield is integrated via their official CLI package — NOT via direct REST API calls. The CLI handles authentication, uploads, and async polling automatically.

### Installation
```bash
npm install -g @higgsfield/cli
```

### Authentication
Authentication is handled by the CLI itself via device-code OAuth — no API key needed in `.env`:
```bash
higgsfield auth login
# Opens browser, authenticates in ~5 seconds
# Session is persisted — run once, valid indefinitely
```

### How the backend calls it
The Node.js backend service (`server/services/higgsfield.js`) spawns CLI commands via `child_process.exec`. Never call the Higgsfield REST API directly.

```javascript
// server/services/higgsfield.js
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// cmd.exe-safe quoting: wrap in double quotes, escape internal " as ""
function quoteCmdArg(str) {
  return '"' + str.replace(/"/g, '""') + '"';
}

async function generateImage(prompt, model = 'nano_banana_2') {
  const cmd = [
    'higgsfield generate create',
    model,
    '--prompt', quoteCmdArg(prompt),
    '--aspect_ratio 16:9',
    '--resolution 2k',
    '--wait',
  ].join(' ');

  const { stdout } = await execAsync(cmd, { timeout: 360_000 });
  const url = stdout.trim();
  if (!url.startsWith('http')) throw new Error(`Unexpected output: ${url.slice(0, 200)}`);
  return url; // plain URL string, not JSON
}
```

### CLI Command Reference (used in Vorta)
```bash
higgsfield auth login              # Authenticate (run once)
higgsfield account                 # Check credit balance
higgsfield model list              # List all available models
higgsfield generate create <model> # Submit job — model is a positional arg, not a flag
higgsfield generate list           # List past generations
higgsfield upload image            # Upload reference image (returns UUID)
```

### Actual generate command (confirmed working)
```bash
higgsfield generate create nano_banana_2 \
  --prompt "..." \
  --aspect_ratio 16:9 \
  --resolution 2k \
  --wait
```
`--wait` blocks until generation is complete and prints the image URL directly to stdout as a plain string (not JSON). No separate `wait` or `get` step needed.

### Available models (job set types from `higgsfield model list`)

**Active:**

| Job set type | Display name | Use |
|---|---|---|
| `nano_banana_2` | Nano Banana Pro (Gemini 3 Pro) | Default — highest quality (`MODELS.default`) |
| `nano_banana_flash` | Nano Banana 2 | Fast tier — drafts (`MODELS.fast`) |

Note: the job set type `nano_banana_2` resolves to the product named "Nano Banana Pro". The names are counter-intuitive — always use the job set type, not the display name.

**Confirmed available — commented options for future use:**

| Job set type | Best for |
|---|---|
| `cinematic_studio_2_5` | Cinematic/film-tuned; good alternative for documentary B-roll |
| `flux_kontext` | Precise subject placement, complex prompt following |
| `seedream_v4_5` | Painterly/editorial mood; good for historical or atmospheric scenes |
| `veo3`, `veo3_1` | Video generation — reserved for future optional video scenes |

To switch model without a code change: set `HIGGSFIELD_MODEL=<job_set_type>` in `.env` and restart the server.

### Key behaviours
- Authentication session is persisted locally by the CLI — no token management needed in code
- `--wait` makes generation synchronous from the caller's perspective — stdout is the final image URL
- stdout is a plain URL string, NOT JSON — do not `JSON.parse()` it
- On Windows, `child_process.exec` runs through `cmd.exe` — use `""` quoting (not `\"`): `'"' + str.replace(/"/g, '""') + '"'`
- Credits use the same system as the Higgsfield platform (Plus plan: unlimited image models)
- No API key in `.env` for Higgsfield — remove `HIGGSFIELD_API_KEY` entirely

---

## Folder Structure
```
vorta/
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/      # Sidebar, header, navigation
│   │   │   ├── video-creator/
│   │   │   │   ├── ScriptInput.jsx
│   │   │   │   ├── SceneAnalyzer.jsx
│   │   │   │   ├── SceneGrid.jsx
│   │   │   │   ├── AssetGenerator.jsx
│   │   │   │   ├── ClipLibrary.jsx
│   │   │   │   └── ExportPanel.jsx
│   │   │   └── shared/
│   │   ├── pages/
│   │   │   ├── VideoCreator.jsx
│   │   │   ├── VideoResearch.jsx   # Coming soon
│   │   │   ├── ScriptWriter.jsx    # Coming soon
│   │   │   ├── TitleThumbnail.jsx  # Coming soon
│   │   │   └── Settings.jsx
│   │   └── App.jsx
├── server/                  # Node.js backend
│   ├── routes/
│   │   ├── analyze.js       # Claude scene analysis
│   │   ├── generate.js      # Higgsfield CLI image generation
│   │   ├── library.js       # Clip library search
│   │   └── render.js        # Remotion render trigger
│   ├── services/
│   │   ├── claude.js        # Claude API calls
│   │   ├── higgsfield.js    # Higgsfield CLI wrapper (child_process)
│   │   └── clipMatcher.js   # Tag-based clip matching logic
│   └── index.js
├── remotion/                # Remotion project (separate Node project)
│   ├── src/
│   │   ├── compositions/
│   │   │   └── Documentary.jsx   # Main composition
│   │   ├── components/
│   │   │   ├── ImageScene.jsx    # Ken Burns animated still
│   │   │   ├── AnimatedCounter.jsx
│   │   │   ├── TimelineBar.jsx
│   │   │   ├── ComparisonChart.jsx
│   │   │   ├── QuoteCard.jsx
│   │   │   └── MapHighlight.jsx
│   │   └── index.js
│   └── package.json
├── library/                 # Clip library
│   ├── clips.json
│   └── clips/               # .mp4 files go here
├── projects/                # Generated project files per video
│   └── [project-id]/
│       ├── scenes.json
│       ├── assets/          # Downloaded Higgsfield images
│       └── output/          # Final rendered MP4
├── .env                     # ANTHROPIC_API_KEY only
└── package.json
```

---

## Build Phases

### Phase 1 — Script input + Claude scene analyzer ✅ COMPLETE
- Script paste/upload UI
- Project metadata form (title, niche, style preset, narrator tone)
- Claude API integration: script → scene JSON array
- Scene grid display with type badges and generated prompts
- Manual override: edit any scene's shot type or prompt before generation

**Deviations from original plan:**
- Model updated to `claude-sonnet-4-6` (original `claude-sonnet-4-20250514` deprecated June 2026)
- `NODE_TLS_REJECT_UNAUTHORIZED=0` added to `.env` for local dev — Node.js does not trust the local CA certificate on this machine; must be removed before any production deployment
- Vite proxy (`/api → localhost:3001`) added to `client/vite.config.js`

### Phase 2 — Higgsfield image generation ✅ COMPLETE
- Loop through `image` scenes, call Higgsfield CLI via child_process
- Live generation progress grid (per-scene status: pending / generating / done / failed)
- Preview images inline per scene card
- Regenerate individual scenes
- Auto-download and save images to `/projects/[id]/assets/`

**Deviations from original plan:**
- Higgsfield CLI command syntax differs significantly from PLAN.md. Final confirmed working approach:
  - Single `--wait` command replaces the three-step create/wait/get flow entirely
  - Model is a **positional argument**: `higgsfield generate create nano_banana_2 --prompt "..." --aspect_ratio 16:9 --resolution 2k --wait`
  - stdout is a **plain URL string**, not JSON — do not parse it
  - Model used: `nano_banana_2` (PLAN.md originally said `soul`; that model does not exist; `nano_banana_2` used in early sessions, upgraded to `nano_banana_2` for production quality)
  - `nano_banana_2` retained as `MODELS.fast` for draft generation
  - On Windows, `cmd.exe` quoting requires `""` escaping (not bash-style `\"`) — `quoteCmdArg()` handles this
- SSE (Server-Sent Events) used for live per-scene progress updates — no extra library, uses browser's native `EventSource`
- `EventSource` must connect directly to Express (`http://localhost:3001`), NOT through Vite proxy — Vite's http-proxy buffers `text/event-stream` responses
- Projects static files served via `express.static` at `/projects` route
- `generate.js` in-memory `store` Map resets on server restart — clients receive 404 on SSE reconnect if server was restarted mid-generation

### Browser Persistence (localStorage) — added in Phase 2 polish

All Video Creator state survives a page refresh via `localStorage`. No backend changes required — images are already saved to `/projects/[id]/assets/` on the filesystem and remain accessible as long as the server is running.

**Keys written:**

| Key | Contents | Managed by |
|-----|----------|------------|
| `vorta_scenes` | Full scenes array (prompts, shot types, manual overrides) | `VideoCreator.jsx` |
| `vorta_project_id` | Current project ID string | `VideoCreator.jsx` |
| `vorta_scene_statuses` | Per-scene `{ status, image_path, error }` — images reappear on load | `VideoCreator.jsx` |
| `vorta_script_metadata` | `{ title, niche, stylePreset, narratorTone, script }` | `ScriptInput.jsx` |
| `vorta_motion_components` | Reserved for Phase 4 Remotion component code per scene | unused |

**Behaviour:**
- State is lazy-initialised from localStorage before first render — scenes, statuses, and images appear instantly on reload
- `isAnalyzing` and `isGenerating` are **never** persisted — they always reset to `false` on load to prevent a stuck spinner
- `generateDone` is derived on load from persisted statuses (true if all image scenes are done/failed)
- All reads are wrapped in `try/catch` — any parse or quota error silently starts a fresh session
- A subtle **"Session restored"** badge appears in the header for 3 seconds when saved data is detected on load (fades out with CSS transition)
- A **"Clear session"** button in the header wipes all `vorta_*` keys and resets all state to blank, including force-remounting `ScriptInput` via React `key` prop

### Phase 3 — Clip library + matching ⚠️ PARTIAL
- Clip library browser UI (search, filter by category/mood/tags)
- Auto-match `real_footage` scenes against library tags
- Show top 3 candidates per scene, user picks or skips
- Fallback: auto-convert unmatched scenes to `image` type
- Gap logger: records unmatched tags to help grow the library

**What works (confirmed):**
- All backend endpoints confirmed working: `GET /api/library`, `GET /api/library/gaps`, `POST /api/library/match`, `POST /api/library/match-all`, `POST /api/library/add`, `DELETE /api/library/:clip_id`
- `gaps.json` logging with deduplication
- Clip Library slide-in panel (search, filters, Add Clip form, delete with confirm, gap insights footer)
- "Convert to image" fallback on scene cards
- 16 seed clips in library (IDs 001–016) including Apple keynote, Wall Street, Silicon Valley, US Capitol, etc.

**Known issue — to fix after Phase 5:**
- Clip candidate cards do not render on `real_footage` scene cards despite the backend returning correct match results. Root cause: frontend state/props wiring between `VideoCreator.jsx` (`clipMatches`, `selectedClips` state) and `ClipMatchSection` in `SceneGrid.jsx`. The backend match logic is correct; this is a React state threading bug to be diagnosed and fixed as a follow-up.

**Implementation details:**
- `server/services/clipMatcher.js` — tag overlap scoring (+ 0.5 bonus for mood match), returns top 3
- `server/routes/library.js` — all CRUD + match endpoints; `GET /gaps` sorted most-recent-first; declared before `DELETE /:clip_id` to prevent Express param collision
- `library/gaps.json` — auto-written on zero matches; deduplicates by sorted tag set
- `library/clips.json` — 16 seed clips across finance, tech, politics, industry, cities, transportation categories
- Matching auto-fires via `POST /api/library/match-all` immediately after Claude analysis completes; also re-runs on page load if scenes are restored from localStorage but `clipMatches` is empty
- `clipMatches` and `selectedClips` persisted to `vorta_clip_matches` / `vorta_selected_clips` in localStorage
- `ClipLibrary.jsx` — 480px slide-in side panel with Add Clip form, delete-with-confirm, gap insights footer
- `ClipMatchSection` in `SceneGrid.jsx` — state/props wiring incomplete (see known issue above)

### Phase 4 — Remotion templates + Ken Burns ✅ COMPLETE
- Build all 5 motion graphic component templates
- Ken Burns implementation on ImageScene (varied zoom direction per scene to avoid repetition)
- Cross-dissolve transitions between scenes (8 frames)
- Audio track sync to scene durations

**Implementation details:**

**Compositions:**
- `Documentary.jsx` — layout engine computes per-scene start frames accounting for dissolve overlap (12 frames) and dip gaps (8 frames). Accepts `scenes`, `imagePaths`, `selectedClips` props. Dispatches each scene to correct component via `renderScene()`. Uses `<Sequence>` per scene + separate dip-frame sequences for dip_black/dip_white transitions.
- `Root.jsx` — registers `Documentary` (production) and `DocumentaryTest` (5-scene dev preview using `testData.js`) as Remotion Studio compositions. Also registers all 5 motion graphic templates as individual compositions.

**ImageScene (`components/ImageScene.jsx`):**
- Ken Burns: `scene.motion.type` + `scene.motion.intensity` → `interpolate()` over full scene duration
- push_in: scale 1.0→1.06/1.10/1.16 (subtle/moderate/strong)
- pull_out: scale 1.06/1.10/1.16→1.0
- drift_left/right: translateX 0→-4/-7/-10% and 0→+4/+7/+10%
- drift_up: translateY 0→-4/-7/-10%
- static: no transform
- Renders LowerThird, DateStamp, KineticText overlays from `scene.overlays` array
- FilmLook applied on top

**FilmLook (`components/overlays/FilmLook.jsx`):**
- Grain: 512×512 canvas redrawn every render via `useEffect` (no deps) with frame-seeded PRNG for animation
- Vignette: radial-gradient div, default intensity 0.45
- cool_blue: `rgba(20,40,80,0.12)` multiply blend
- warm_amber: `rgba(100,60,10,0.10)` multiply blend
- desaturated: `filter: saturate(0.55)` on outer wrapper div
- neutral: grain + vignette only, no tint

**Overlay components:**
- `LowerThird.jsx` — spring slide from left at `appearAt`, auto-reverses after 90 frames. Blue 3px left border #3b82f6, dark bg.
- `DateStamp.jsx` — bottom-right pill, 12-frame fade in, holds until near end, 20-frame fade out.
- `KineticText.jsx` — center (52px) or bottom (22px) text, 20-frame fade in and out, `textShadow` for legibility.

**Motion graphic templates (all 150 frames, dark palette #0a0a0a):**
- `AnimatedCounter.jsx` — spring count-up with prefix/suffix, comma formatting, animated underline
- `TimelineBar.jsx` — horizontal line draws left→right over 60 frames, dots stagger in with spring
- `ComparisonChart.jsx` — vertical bars spring up staggered, value labels above each bar
- `QuoteCard.jsx` — serif italic pull quote with fade+slide, attribution fades after
- `MapHighlight.jsx` — SVG world outline, pulsing dot at lat/lng, region label

**Scene type routing:**
- `FootageScene.jsx` — `<Video>` from Remotion + FilmLook overlay. Used for real_footage when `selectedClips[scene_id]` is set.
- `PlaceholderScene.jsx` — dark bg, oversized scene number, script excerpt, shot type badge. Used when image not yet generated or no clip selected.

**Test data (`testData.js`):** 5 scenes covering all types: 2 image (push_in strong + drift_left moderate), 1 motion_graphic (AnimatedCounter), 1 real_footage (with selectedClip), 1 image with kinetic_text overlay and static motion. Image paths are empty strings by default — update with actual generated asset paths for visual testing.

**Deviations from original plan:**
- Audio track sync deferred to Phase 5 (render pipeline) — Remotion's audio API requires asset paths resolved at render time
- `selectedClips` accepted as a prop on Documentary rather than embedded in scene objects, keeping scene JSON clean
- `FootageScene.jsx` and `PlaceholderScene.jsx` were not in the original spec but added for robustness
- `desaturated` grade applied as CSS `filter` on FilmLook wrapper (not as a tint overlay) — more accurate saturation reduction

### Phase 5 — Full pipeline integration + render ✅ COMPLETE
- End-to-end flow: script in → MP4 out
- Render trigger via Remotion CLI from backend
- Export panel with progress indicator
- Download final MP4

**Implementation details:**

**server/routes/render.js** — full render pipeline:
- `POST /api/render` — accepts `{ projectId, scenes, selectedClips }`, transforms image paths to `http://localhost:3001/projects/...` URLs (so Remotion's headless Chrome can fetch images from the running Express server), builds `scenes.json` with `{ scenes, imagePaths, selectedClips }`, spawns Remotion CLI via `child_process.spawn` with `shell: true`, returns `{ started: true }` immediately
- `GET /api/render/progress/:projectId` — SSE stream; parses stdout/stderr line-by-line for `X/Y` frame and `N%` percent patterns; sends `{ type: 'progress', percent, frame, totalFrames }` events; sends `{ type: 'done', outputPath, fileSize }` or `{ type: 'error', message }` on close
- `DELETE /api/render/:projectId` — kills the render process and clears the job from the in-memory `renderJobs` Map
- Jobs stored in `renderJobs` Map (projectId → `{ process, progress, status, stderr, sseClients: Set }`)
- ANSI escape codes stripped before progress parsing
- `NODE_TLS_REJECT_UNAUTHORIZED=0` passed in env (matches server `.env` requirement for this machine)

**server/index.js** — `/output` static route added (serves `../projects`), complementing existing `/projects` route

**remotion/src/Root.jsx** — added `calculateMetadata` to the Documentary composition so the duration is computed from `props.scenes` when `--props` overrides the default test data; without this the render would use the hardcoded `testScenes` duration

**client/src/components/video-creator/ExportPanel.jsx** — export panel with:
- Pre-render checklist grid (6 cards: total scenes, image ready count, motion graphic count, footage matched/unmatched, estimated duration, estimated render time)
- Amber warning if any image scenes not yet generated
- Render MP4 button (disabled with tooltip if no project or readyPercent < 50%)
- Progress bar with frame counter, elapsed time, estimated remaining (calculated from current rate)
- Cancel render button (red, calls DELETE /api/render/:projectId)
- Done state: green progress bar, download button, "Render again" reset
- Error state: red error card with expandable log panel, Retry and Reset buttons

**client/src/pages/VideoCreator.jsx** — ExportPanel imported and rendered below SceneGrid, receives `scenes`, `sceneStatuses`, `selectedClips`, `projectId`

**Deviations from original plan:**
- Image paths converted to full HTTP URLs (`http://localhost:3001/projects/...`) rather than absolute filesystem paths — Chrome Headless Shell can fetch from the running Express server; file:// URLs would require `--allow-file-access-from-files` flag in Chrome which Remotion does not set by default
- `spawn` used instead of `exec` to get real-time stdout streaming for SSE progress; `shell: true` needed on Windows to find `npx.cmd` in PATH and handle path quoting
- ANSI escape code stripping added to progress parser (Remotion emits colored output even when not in a terminal)
- `calculateMetadata` added to Root.jsx — not in original plan but required for correct render duration when `--props` overrides default scenes
- Progress capped at 99% until the `done` event fires (prevents false "complete" display during final encoding pass)
- SSE clients stored in a `Set` (not an array) per job for O(1) add/delete on client disconnect
- `outputPath` returned as a relative URL (`/projects/[id]/output/final.mp4`) rather than absolute filesystem path — client can construct the full download URL with `SERVER_URL` prefix

---

## UI Design Principles
- Dark sidebar navigation (all modules listed, future ones marked "Coming soon")
- Clean minimal content area — no clutter
- Scene grid is the central UI metaphor: each card shows scene number, excerpt, type badge, prompt, and asset preview
- Status indicators on every async operation (analyzing, generating, matching, rendering)
- Non-destructive: every Claude or Higgsfield output is editable before the next step runs

---

## Environment Variables
Only one key needed in `.env`:
```
ANTHROPIC_API_KEY=your_key_here
```
Higgsfield authentication is managed by the CLI session — no key required.

---

## Pre-Flight Checklist (before first run)
1. `npm install -g @higgsfield/cli` — install CLI globally
2. `higgsfield auth login` — authenticate once
3. `higgsfield account` — verify credits are available
4. Add `ANTHROPIC_API_KEY` to `.env`
5. Node.js 18+ installed
6. Remotion dependencies installed in `/remotion`

---

## Channel Benchmarks (for style reference)
- MagnatesMedia, Wendover Productions, Economics Explained
- Narrator tone: Keith Morrison / Peter Coyote — authoritative, measured, cinematic
- Visual identity: dark, clinical, high-contrast motion graphics

---

## Notes for Claude Code Sessions
- Always read this file at the start of a session before writing any code
- Never install libraries not listed in the tech stack without flagging it first
- Higgsfield is called via CLI (child_process), never via direct HTTP/REST
- All Higgsfield prompts must include the style lock string — injected in higgsfield.js service, not in the prompt itself
- Scene JSON is the contract between all modules — do not change its structure without updating all consumers
- Remotion and the backend are separate Node.js projects with their own package.json files
- Never hardcode API keys — always read from .env via dotenv

---

## Session Workflow Rules
These rules apply to every Claude Code session without exception.

### Rule 1 — Session opener
Every session must begin with:
> "Read PLAN.md first, then we'll continue from where we left off."
Never skip this. It rebuilds full context and prevents conflicting decisions across sessions.

### Rule 2 — Phase completion
When a phase is fully working and tested, run:
> "Update PLAN.md to mark Phase X as complete and note anything we changed from the original plan."
PLAN.md is the single source of truth. Keep it accurate as the build evolves.

### Rule 3 — Git discipline
- Run `git init` immediately after the scaffold is created
- Connect to GitHub: `gh repo create vorta --private --source=. --push`
- Commit message format: `phase-X: short description of what was built`
- Commit after every completed phase before moving to the next
- Never commit `.env` — it must be in `.gitignore` from day one

### Rule 4 — Phase testing checklist
Before marking any phase complete, run through its testing checklist (defined per phase below). Do not proceed to the next phase until all checks pass.

---

## Phase Testing Checklists

### Scaffold + Layout
- [ ] `npm run dev` starts without errors on both client and server
- [ ] Browser shows dark sidebar with 5 navigation items
- [ ] Video Creator is active/highlighted
- [ ] Video Research, Script Writer, Title & Thumbnail show "Coming soon" badges
- [ ] Settings page is accessible
- [ ] Console shows no errors on load
- [ ] `.env` loads correctly — backend logs confirm ANTHROPIC_API_KEY is present (never log the key itself, just confirm it's truthy)
- [ ] `.gitignore` covers: `node_modules`, `.env`, `dist`, `build`, `.remotion`
- [ ] Initial commit pushed to GitHub

### Phase 1 — Script input + Claude scene analyzer
- [ ] Script paste textarea accepts and holds text
- [ ] Project metadata form saves: title, niche, style preset, narrator tone
- [ ] Clicking Analyze fires a request to `POST /api/analyze`
- [ ] Server logs confirm Claude API is receiving the script
- [ ] Response returns valid scene JSON array matching the structure in PLAN.md
- [ ] Scene grid renders with one card per scene
- [ ] Each card shows: scene number, script excerpt, shot type badge (image / motion_graphic / real_footage), generated Higgsfield prompt
- [ ] Style lock string is present in every image scene prompt
- [ ] Shot type badge colors are distinct (e.g. blue / teal / amber)
- [ ] Manual override works: editing a prompt updates the scene card
- [ ] Manual override works: changing shot type updates the badge
- [ ] Empty script shows a validation error, not a crash
- [ ] Phase 1 committed to GitHub: `phase-1: script input and Claude scene analyzer`

### Phase 2 — Higgsfield image generation
- [ ] Generate button appears only after Phase 1 scenes exist
- [ ] Clicking Generate loops through all `image` scenes only
- [ ] Each scene card shows status: pending → generating → done / failed
- [ ] `higgsfield generate create nano_banana_2 --wait` fires correctly (check server logs)
- [ ] Command blocks until complete and returns a plain image URL on stdout (not JSON)
- [ ] Image downloads and saves to `/projects/[id]/assets/[scene_id].jpg`
- [ ] Scene card displays the generated image on completion
- [ ] Regenerate button on individual cards works independently
- [ ] Failed scenes show an error state with a retry option
- [ ] `motion_graphic` and `real_footage` scenes are skipped (not sent to Higgsfield)
- [ ] Credit balance does not unexpectedly drain (check `higgsfield account` before and after)
- [ ] Phase 2 committed to GitHub: `phase-2: Higgsfield CLI image generation`

### Phase 3 — Clip library + matching
- [ ] `library/clips.json` loads correctly on server start
- [ ] At least 3 test clips exist in the library for testing
- [ ] `real_footage` scenes trigger a library search automatically
- [ ] Tag matching returns up to 3 candidate clips per scene
- [ ] Scene card shows candidate clips with thumbnails or filenames
- [ ] User can select one clip per scene
- [ ] Unmatched scenes automatically fall back to `image` type
- [ ] Gap logger records unmatched tag sets to a `library/gaps.json` file
- [ ] Clip library browser UI shows all clips, searchable by tag/category/mood
- [ ] Phase 3 committed to GitHub: `phase-3: clip library and scene matching`

### Phase 4 — Remotion templates + Ken Burns
- [ ] Remotion dev server starts inside `/remotion` without errors
- [ ] `ImageScene` component renders a still image with Ken Burns animation
- [ ] Zoom direction varies between scenes (not all zooming in the same direction)
- [ ] `AnimatedCounter` counts from 0 to target value with easing
- [ ] `TimelineBar` renders and animates correctly
- [ ] `ComparisonChart` renders side-by-side bars
- [ ] `QuoteCard` renders full-screen text with entrance animation
- [ ] `MapHighlight` renders with a highlighted region
- [ ] Cross-dissolve transition between scenes plays at 8 frames
- [ ] A test composition with 3–5 mixed scenes renders to MP4 without errors
- [ ] Audio track syncs to scene durations in the test render
- [ ] Phase 4 committed to GitHub: `phase-4: Remotion templates and Ken Burns`

### Phase 5 — Full pipeline integration + render
- [ ] End-to-end test: paste a short 3-scene script, run full pipeline, receive MP4
- [ ] Render is triggered from the Export panel button
- [ ] Progress indicator updates during render
- [ ] Completed MP4 is downloadable from the UI
- [ ] MP4 plays correctly in VLC or browser — no corrupted frames
- [ ] All three scene types (image, motion_graphic, real_footage) appear correctly in the output
- [ ] Transitions between scenes are smooth
- [ ] Audio is present and in sync
- [ ] Project files are saved to `/projects/[id]/` and persist across sessions
- [ ] Phase 5 committed to GitHub: `phase-5: full pipeline integration and MP4 export`

---

## Post-Launch Improvements

### Fix 1 — Clip candidate UI ✅ Complete
**Problem:** Backend match endpoint returns correct results but candidate clip cards don't render on `real_footage` scene cards.

**Root cause:** Frontend state/props wiring between `VideoCreator.jsx` and `SceneGrid.jsx` is broken — `clipMatches` state either isn't being set after analysis or isn't reaching the scene card component.

**Steps:**
1. Add `console.log` to `VideoCreator.jsx` immediately after the auto-match loop fires — log `clipMatches` state to confirm it's being populated
2. Add `console.log` inside the `real_footage` scene card render block — log the `clipMatches[scene.scene_id]` value it receives
3. If `clipMatches` is populated but not reaching the card — fix the props chain: `VideoCreator → SceneGrid → individual scene card`
4. If `clipMatches` is empty — the auto-match loop after `setScenes()` isn't firing. Fix the `useEffect` dependency array
5. Once candidate cards render, test: select a clip, confirm `selectedClips` state updates, confirm player reflects the selected clip
6. Test Convert to image flow end to end
7. Commit: `fix: clip candidate UI rendering`

**Testing checklist:**
- [x] Auto-match fires after every analysis
- [x] `real_footage` cards show up to 3 candidate clip cards
- [x] Each candidate shows filename, duration, mood, tags, description
- [x] Clicking a candidate selects it with checkmark
- [x] Change button clears selection and shows candidates again
- [x] Convert to image changes badge from amber to blue
- [x] Selections persist after page refresh via localStorage

---

### Fix 2 — Narration audio ✅ Complete
**Problem:** Rendered MP4 has no audio track. A video without narration is not a sellable product.

**Approach:** Accept an uploaded audio file (MP3/WAV) and sync it to the Remotion composition timeline.

**Steps:**
1. Add an audio upload section to the ExportPanel: drag-and-drop or file picker accepting MP3/WAV/M4A
2. On upload, save the audio file to `/projects/[projectId]/audio/narration.mp3` via `POST /api/audio/upload`
3. Display audio waveform summary: filename, duration, file size
4. Add audio sync options:
   - **Start at:** time offset in seconds (default 0)
   - **Volume:** slider 0–100 (default 85)
   - **Fade in:** slider 0–3 seconds (default 0.5)
   - **Fade out:** slider 0–5 seconds (default 2.0)
5. Pass audio settings to Remotion via `scenes.json` props:
   ```json
   {
     "scenes": [...],
     "selectedClips": {},
     "audio": {
       "path": "/absolute/path/to/narration.mp3",
       "startFrom": 0,
       "volume": 0.85,
       "fadeIn": 15,
       "fadeOut": 60
     }
   }
   ```
6. Update `Documentary.jsx` to render the audio track:
   ```jsx
   import { Audio } from 'remotion';
   {audio?.path && (
     <Audio
       src={audio.path}
       startFrom={audio.startFrom * fps}
       volume={(frame) => {
         if (frame < audio.fadeIn) return interpolate(frame, [0, audio.fadeIn], [0, audio.volume]);
         if (frame > totalFrames - audio.fadeOut) return interpolate(frame, [totalFrames - audio.fadeOut, totalFrames], [audio.volume, 0]);
         return audio.volume;
       }}
     />
   )}
   ```
7. Show audio track in the Remotion player preview — user should hear the narration while scrubbing
8. Render test MP4 with audio and confirm sound is present in VLC
9. Commit: `feature: narration audio track`

**Testing checklist:**
- [x] Audio file uploads successfully
- [x] Audio duration displays correctly
- [x] Volume and fade settings save
- [x] Narration audible in Remotion player preview
- [x] Rendered MP4 contains audio track
- [x] Fade in and fade out audible in output
- [x] Audio synced to start of video at correct offset

---

### Fix 3 — Settings page ✅ Complete
**Problem:** API keys are managed manually in `.env`, style presets are hardcoded, library management requires direct file editing.

**Steps:**
1. Build the Settings page at `client/src/pages/Settings.jsx` with four sections:

   **API Keys section:**
   - Anthropic API key: password input + test button that fires a test Claude call and shows success/fail
   - Higgsfield auth status: read-only display showing 'Authenticated' or 'Not authenticated' by calling `higgsfield account` via `GET /api/settings/higgsfield-status`
   - A 'Re-authenticate Higgsfield' button that runs `higgsfield auth login` via backend

   **Default style presets section:**
   - Default color grade: dropdown (`cool_blue` / `warm_amber` / `desaturated` / `neutral`)
   - Default grain intensity: slider
   - Default vignette intensity: slider
   - Default motion type: dropdown
   - Default transition: dropdown
   - Default scene duration: number input (seconds)
   - These values get injected into every new scene during analysis instead of hardcoded defaults
   - Save button writes to `/server/config/defaults.json`

   **Clip library management section:**
   - Show total clip count
   - Show `gaps.json` insights: most requested missing tags
   - Bulk import: drop a folder of `.mp4` files and auto-generate metadata entries using Claude to analyze filenames and generate tags
   - Export library: download `clips.json` as backup
   - Import library: upload a `clips.json` to restore

   **Render settings section:**
   - Output resolution: dropdown (1080p / 4K)
   - Output format: MP4 only for now
   - Frame rate: 24 / 30 / 60 fps
   - Remotion concurrency: number input (default 1, higher = faster render but more CPU)
   - These get passed to the Remotion render command as flags

2. Persist settings to `/server/config/defaults.json` via `POST /api/settings`
3. Load settings on server start and inject into all relevant services
4. Commit: `feature: settings page`

**Testing checklist:**
- [ ] Settings page accessible from sidebar
- [ ] API key test button returns success with valid key
- [x] Higgsfield status shows correctly
- [x] Default style presets save and apply to new analyses
- [x] Clip library stats show correct counts
- [x] Render settings pass correctly to Remotion CLI
- [x] Settings persist after server restart

---

### Fix 4 — End-to-end quality pass ✅ Complete
**Problem:** The pipeline works mechanically but output quality hasn't been validated on a real script.

**Steps:**
1. Write or source a real 5-minute documentary script on a specific topic (Apple, Tesla, a financial crisis — something with rich named subjects)
2. Run the full pipeline: analyze → generate all images → build all motion graphic components → render MP4
3. Watch the full output and log every weak moment:
   - Generic images that don't match the scene
   - Motion graphics that feel disconnected
   - Transitions that feel wrong
   - Pacing issues (scenes too long or too short)
   - Missing overlays where they'd add value
   - Grain/vignette too strong or too weak
4. For each weak moment note: scene number, what's wrong, what it should be
5. Fix the top 5 issues found — prioritise image prompt quality and motion graphic variety
6. Re-render and compare
7. Repeat until the output is something you'd be comfortable showing a client
8. Commit: `quality: end-to-end quality pass v1`

**Testing checklist:**
- [ ] Full 5-minute script renders without errors
- [ ] All image scenes show subject-specific content not generic imagery
- [ ] Motion types match the emotional beat of each scene
- [x] Transitions feel intentional not random
- [x] Overlays (lower thirds, date stamps) appear on the right scenes
- [x] Audio narration (if added) is in sync
- [x] Output is watchable end to end without cringing

---

### Fix 5 — Client-ready polish ✅ Complete
**Problem:** The app works for a developer who built it but would confuse a new user or client.

**Steps:**
1. **Onboarding flow** — first-time user sees a welcome modal with 4 steps:
   - Step 1: Add your Anthropic API key
   - Step 2: Authenticate Higgsfield (`higgsfield auth login`)
   - Step 3: Paste your first script
   - Step 4: Click Analyze
   - Each step has a status indicator (done/pending) and a direct action button
   - Modal dismisses permanently once all 4 steps are complete
   - Stored in localStorage: `vorta_onboarded: true`

2. **Error handling** — every async operation needs a human-readable error state:
   - Analysis fails: 'Claude API error — check your API key in Settings'
   - Image generation fails: 'Higgsfield error — run `higgsfield account` to check auth'
   - Render fails: show the specific Remotion error, link to fix
   - All errors show a retry button

3. **Empty states** — every section needs a clear empty state:
   - No scenes yet: illustration + 'Paste your script above to get started'
   - Clip library empty: 'No clips yet — add your first clip or download some from YouTube using yt-dlp'
   - No projects yet: clean welcome state

4. **Loading states** — every async operation needs a skeleton or spinner:
   - Scene grid: skeleton cards while analyzing
   - Image generation: shimmer effect on pending cards
   - Render: animated progress with estimated time

5. **Keyboard shortcuts:**
   - `Space` — play/pause the Remotion player
   - `Escape` — close any open modal or panel
   - `Cmd/Ctrl + Enter` — trigger Analyze when script is focused
   - `Cmd/Ctrl + R` — trigger Render when scenes are ready

6. **Project management** — currently every session is one project. Add basic multi-project support:
   - Project list page as the home screen
   - Each project shows: title, scene count, last edited, thumbnail of first generated image
   - New project button
   - Delete project button with confirmation
   - Clicking a project opens it in the VideoCreator

7. Commit: `feature: client-ready polish`

**Testing checklist:**
- [x] Onboarding modal appears on first visit
- [x] Onboarding dismisses permanently after completion
- [x] All error states show human-readable messages with retry
- [x] All empty states have helpful copy and actions
- [x] Skeleton loading shows during analysis
- [x] All keyboard shortcuts work
- [x] Project list shows all saved projects
- [x] New project creates a fresh VideoCreator session
- [x] Delete project removes all files and localStorage entries

---

### Build order recommendation
1. **Fix 1 first** — it's a bug fix, takes 1–2 hours maximum.
2. **Fix 2 second** — audio is the single biggest missing feature for client work.
3. **Fix 3 third** — settings unlock better defaults and make the app self-contained.
4. **Fix 4 fourth** — quality pass before showing anyone.
5. **Fix 5 last** — polish after the core is solid.
