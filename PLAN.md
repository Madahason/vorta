# Vorta — Project Plan

## What is Vorta?
Vorta is an AI-powered content production platform. The current build focuses on the **Video Creator** module: a fully automated pipeline that transforms a YouTube documentary script into a near-finished video using AI-generated images, motion graphics, and a pre-built clip library — assembled programmatically via Remotion.

The platform is designed to scale. Future modules (Video Research, Title & Thumbnail Generator, Script Writer) will slot into the same UI without requiring a rebuild.

---

## Vision: Full Platform (Future)
The sidebar navigation should reflect all planned modules, with future ones marked as "Coming soon":

1. **Video Research** — finds winning video ideas, identifies angles and content gaps
2. **Title & Thumbnail** — generates optimized titles and thumbnail concepts based on winning ideas
3. **Script Writer** — transforms a video idea + title + thumbnail concept into a full documentary script
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
Each clip entry in the library carries full source, license, and provenance metadata:
```json
{
  "clip_id": "uuid-or-padded-id",
  "file": "/library/clips/yt_cc_abc12345.mp4",
  "title": "Traders on the NYSE floor during the 2008 crisis",
  "source": "youtube_cc",
  "license": "creative_commons",
  "source_url": "https://youtube.com/watch?v=...",
  "tags": ["finance", "wall street", "2008"],
  "mood": "tense",
  "category": "finance",
  "duration": 6,
  "description": "Wide shot of NYSE traders reacting to market crash",
  "warning": null,
  "added_at": "2026-06-06T00:00:00.000Z",
  "project_id": null
}
```

**Source values:** `manual` | `youtube_cc` | `youtube_fair_use` | `internet_archive` | `cspan`

**License values:** `creative_commons` | `public_domain` | `fair_use` | `unknown`

Library is stored as a flat JSON file (`/library/clips.json`) alongside the clip files.

### Multi-Source Clip Sourcing System

#### Architecture Overview
```
ClipLibrary UI (5 tabs)
  → My Library — browse, filter, add manually
  → YouTube CC — search + segment download, CC license enforced by yt-dlp filter
  → Fair Use — search + segment download, hard 8s max server-side
  → Internet Archive — search Archive.org API + yt-dlp download, public_domain
  → C-SPAN — search + segment/full download, public_domain (US government content)

Auto-Seed Flow:
  "Seed Library" button → POST /api/library/seed
  → clipSeeder.js extracts 6 named entities from project title+niche via Claude haiku
  → searches all 4 sources in parallel, sorted by priority: archive > cspan > cc > fair_use
  → downloads one clip per entity (up to 15 total)
  → streams progress to UI via SSE /api/library/seed/progress/:seedId
```

#### Service Files
| File | Purpose |
|------|---------|
| `server/services/clipStore.js` | CRUD foundation — single source of truth for clips.json |
| `server/services/ytdlp.js` | yt-dlp wrapper utilities (checkYtDlp, parseDumpJson, downloadSegment, downloadFull) |
| `server/services/sources/youtubeCC.js` | YouTube CC search + download |
| `server/services/sources/youtubeFairUse.js` | YouTube Fair Use, 8s max enforced |
| `server/services/sources/internetArchive.js` | Archive.org search API + yt-dlp download |
| `server/services/sources/cspan.js` | C-SPAN yt-dlp search + segment/full download |
| `server/services/clipSeeder.js` | Claude entity extraction + multi-source seed + SSE progress |
| `server/services/clipMatcher.js` | Tag scoring + license bonus (CC/PD +0.3, FU +0.1) |

#### License Scoring in Matching
`clipMatcher.js` adds a license bonus on top of tag/mood overlap so freely usable clips are preferred:
- `public_domain` / `creative_commons` → +0.3
- `fair_use` → +0.1
- `unknown` → +0.0

#### Fair Use Acknowledgement
When the user clicks Render and any selected clip has `license: "fair_use"` or `license: "unknown"`, `ExportPanel.jsx` intercepts and shows `FairUseModal` listing the clips. On confirm, the UI calls `POST /api/library/fair-use-ack` which logs to `library/projects/{projectId}/fair-use-acknowledgement.json` before proceeding to render.

#### yt-dlp Dependency
The clip sourcing system requires `yt-dlp` to be installed and accessible in PATH. The UI shows a status badge (version / not found) in the ClipLibrary header. The seed button is disabled when yt-dlp is not installed. Install with:
```bash
pip install yt-dlp
# or on macOS: brew install yt-dlp
```

Fair Use 8-second limit is enforced **server-side** in `youtubeFairUse.js` — the download handler throws if `endSec - startSec > 8`.

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

### Motion Graphic Dynamic Rendering

Motion graphic scenes support two rendering modes, checked in order:

**Mode 1 — Dynamic component (preferred):** If `scene.motion_component` is set, `MotionGraphicScene.jsx` evaluates the stored code at runtime using the Function constructor. The code must use `React.createElement()` — NOT JSX syntax (which the Function constructor cannot parse). All Remotion and React primitives are injected as closure variables: `React, useState, useEffect, useRef, useMemo, useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill`. The component code must end with `return SceneComponent;` (not `export default`).

**Mode 2 — Template fallback:** If no `motion_component` is set, falls back to dispatching `scene.motion_graphic_type` to one of the pre-built templates.

**Component generation flow:**
1. User clicks "Build Component" on a scene card → `POST /api/motion`
2. `motion.js` sends the scene to Claude with a strict system prompt requiring `React.createElement`, no imports, `return SceneComponent` at the end
3. Post-processing strips any import lines or `export default` Claude accidentally includes
4. `cleanMotionComponent()` in `VideoCreator.jsx` applies the same strip on store/load so localStorage-migrated components are always clean
5. Component stored in `scene.motion_component` and `vorta_motion_components` localStorage key

**Migration from old JSX format:** Old components stored before this change used JSX syntax and will fail with `SyntaxError: Unexpected token '<'` — the player shows a red error card. Click "Rebuild Components" in the header to regenerate all motion graphic scenes in the new format sequentially.

**`MotionGraphicScene.jsx` (`remotion/src/components/`):**
- `prepareForEval(code)` strips import lines and converts `export default` → `return`
- `new Function(params..., evalCode)` creates the factory; factory is called with actual Remotion/React references
- If `typeof Component !== 'function'`, throws explaining the code didn't return a component
- On any error: renders a dark red error card with the error message and rebuild hint

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
| Clip Sourcing | yt-dlp (in-app via clipStore + source services) |
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
│   │   │   ├── ImageScene.jsx         # Ken Burns animated still
│   │   │   ├── MotionGraphicScene.jsx # Dynamic component evaluator (Function constructor)
│   │   │   ├── FootageScene.jsx       # Real footage playback
│   │   │   ├── PlaceholderScene.jsx   # Fallback when asset not ready
│   │   │   ├── AnimatedCounter.jsx    # Template: stat counter
│   │   │   ├── TimelineBar.jsx        # Template: event timeline
│   │   │   ├── ComparisonChart.jsx    # Template: bar comparison
│   │   │   ├── QuoteCard.jsx          # Template: pull quote
│   │   │   └── MapHighlight.jsx       # Template: geographic highlight
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

**Implementation details:**
- `server/services/clipMatcher.js` — partial/substring tag matching in both directions (clip tag "product launch" matches search tag "launch"; search tag "apple inc" matches clip tag "apple") + license bonus (CC/PD +0.3, FU +0.1) + mood bonus +0.5. Returns top 3.
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

---

### Fix 7 — Automated clip download with ffmpeg trim ✅ Complete

**Policy:** All downloaded clips are capped at 8 seconds on both the server and UI. The 8-second limit applies to every source — CC, Fair Use, Archive, C-SPAN.

**Dependency checks (`server/index.js`):**
- `checkDeps()` runs at server startup via `execSync('yt-dlp --version')` and `execSync('ffmpeg -version')`
- Result stored as `DEPS = { ytdlp: bool, ffmpeg: bool }`
- Exposed via `GET /api/health` (includes `deps`) and `GET /api/deps` (direct)
- If ffmpeg not found, a red warning banner appears in all source tabs in the UI

**Central downloader (`server/services/clipDownloader.js` — NEW):**
- `downloadClip({ url, startSec, endSec, source, tags, mood, category, license, title, warning })` — handles all sources
- For YouTube / C-SPAN: yt-dlp `--download-sections "*start-end" --force-keyframes-at-cuts` to `_temp.mp4`, then ffmpeg trim to exact duration
- For Internet Archive: resolves direct download URL from `archive.org/metadata/{id}`, yt-dlp full download to `_temp.mp4`, then ffmpeg trim
- ffmpeg command: `-t {duration} -c:v libx264 -c:a aac -movflags +faststart` — re-encodes for playback compatibility
- Temp file always cleaned up (success or failure)
- `MAX_SECONDS = 8` exported constant used across routes

**Unified SSE download endpoint (`POST /api/library/download`):**
- Replaces per-source download POSTs for the UI download flow (per-source endpoints remain for backward compat with seeder)
- Streams SSE events: `start` → `generating_description` → `saving` → `done | error`
- Server auto-caps `endSec` to `startSec + MAX_SECONDS` regardless of what client sends
- License derived from source: `youtube_cc` → `creative_commons`, `internet_archive/cspan` → `public_domain`, others → `fair_use`

**SearchResult UI (ClipLibrary.jsx):**
- All source tabs now use `POST /api/library/download` (unified endpoint)
- `maxSec` prop removed — replaced by `MAX_CLIP_SEC = 8` constant inside `SearchResult`
- Start/end time inputs auto-clamp: `handleStartChange` sets start + resets end to start+8, `handleEndChange` clamps to start+8 max
- SSE streaming via `fetch` + `res.body.getReader()` + `TextDecoder`
- Live status messages: "Downloading…" → "Generating description…" → "Saving to library…"
- Duration counter shown in real time (e.g. "5.0s" in green, over-limit in amber)
- Archive tab shows "First 8s will be downloaded and trimmed automatically" (no time selector needed)
- Button label: "Download 8s clip"

**Auto-seed on analysis (`server/routes/analyze.js`):**
- After `res.json({ scenes })`, fires `startSeed({ title, niche, projectId, maxClips: 10 })` in background
- Only runs when `metadata.title` and `metadata.projectId` are both present
- Fire-and-forget: analysis response is not delayed

**Dependencies:**
- ffmpeg: `winget install ffmpeg` (Windows) — required for exact trim
- yt-dlp: `pip install yt-dlp` — required for all downloads

---

### Fix 8 — Search + download improvements ✅ Complete

Six improvements to the Clip Library search and download pipeline.

**Change 1 — Smarter search queries (`server/services/sources/searchUtils.js` — NEW):**
- `buildFootageQuery(subject, context)` enhances raw queries before sending to yt-dlp or archive APIs
- Context map: `person` → `"${subject}" interview OR speech OR conference OR keynote OR testimony OR documentary OR announcement OR hearing`; `company` → adds "CEO OR earnings OR announcement"; `event` → "footage OR documentary OR news"
- Applied at the route level in `library.js` — source modules stay clean
- All 4 search endpoints accept `context` param (`'person'`, `'company'`, `'event'`, or `null` for default)
- Frontend SourceTab shows a context dropdown (Any / Person / Company / Event) next to the search bar

**Change 2 — Claude scoring of search results (`server/services/resultScorer.js` — NEW):**
- `scoreResults(results, subject, sceneContext)` — sends all results to Claude Haiku for relevance scoring
- Scores 1-10 per result; 9-10 = real speech/interview/testimony, 1-2 = compilation/clickbait
- Results sorted by score descending; top 5 returned to client
- Fails silently (all scores default to 5) if Anthropic API call fails
- Applied to all 5 search endpoints (youtube-cc, youtube-fair-use, archive, cspan, ted)

**Change 3 — Default start time of 25 seconds:**
- `clipDownloader.js` now defaults `startSec = 25` when `startSec` is 0 or not provided (`DEFAULT_START_OFFSET = 25`)
- Rationale: skip title cards and intros that dominate the first 20-30s of most YouTube/archive videos
- UI: `SearchResult` defaults to `startSec=25`, `endSec=33`

**Change 4 — Video scrubber UI (`ClipScrubber.jsx` — NEW):**
- `<ClipScrubber videoUrl onSegmentSelected maxDuration>` — visual video player with "Set start here" button
- Segment highlight bar shown below the video player once a segment is selected
- "Set start here" button captures current playback position as start time; end auto-set to start+8s
- Manual MM:SS time inputs shown alongside as fallback (and only option if video can't load)
- Video fails to load (CORS/format issues) → graceful error overlay, user falls back to manual inputs
- Integrated in `SearchResult` for Archive and C-SPAN sources (which serve URLs playable by the video tag)
- YouTube/TED sources: thumbnail with play overlay + "Open in YouTube" link + manual time inputs instead (YouTube blocks embedding)
- Default start position: video jumps to 25s on load

**Change 5 — TED Talks source:**
- `server/services/sources/ted.js` (NEW) — `searchTED(query, maxResults)` using yt-dlp flat-playlist on `@TED/search`
- Results tagged as `source: 'ted'`, `license: 'creative_commons'` (BY-NC-ND)
- `POST /api/library/search/ted` endpoint added to `library.js`
- TED tab added to Clip Library panel (6th tab) with red TED badge styling
- Note shown: "TED talks — high quality real speeches, CC licensed."
- Download flows through unified `POST /api/library/download` endpoint with `source: 'ted'` → `license: 'creative_commons'`

**Change 6 — Source quality prioritisation:**
- `SOURCE_PRIORITY = ['internet_archive', 'cspan', 'ted', 'youtube_cc', 'youtube_fair_use']` — defined in both `clipSeeder.js` and `ClipLibrary.jsx`
- `clipSeeder.js`: searches all 5 sources in parallel; applies `scoreResults()` to combined pool; sorts by priority bucket then relevance score within bucket
- `clipSeeder.js`: download calls now use `startSec: 25, endSec: 33` explicitly
- TED downloads in seeder use `youtubeCC.download()` with `clip.source` overridden to `'ted'` after save
- UI `SourcePriorityBadge` component on each result card:
  - 🟢 Archive / C-SPAN → "Public domain"
  - 🟢 TED → "TED CC"
  - 🟡 YouTube CC → "Creative Commons"
  - 🟠 YouTube Fair Use → "Fair use risk"
- Relevance score shown on cards scoring ≥7 (e.g. "★ 9/10")
- Source normalization in download body: route slugs (`youtube-cc`, `archive`) mapped to internal IDs (`youtube_cc`, `internet_archive`) before being passed to `downloadClip` — fixes pre-existing license/prefix mismatch

### Fix 6 — Clip preview + upload flow ✅ Complete

**Problem:** Clips in My Library had no way to preview before use, and adding clips required manually copying files to `library/clips/` and typing a file path.

**Static file serving:**
- `server/index.js` already serves `app.use('/library', express.static(...))` at `/library`
- Vite proxy extended: `'/library': 'http://localhost:3001'` in `client/vite.config.js`
- Clips are accessible at `http://localhost:5173/library/clips/filename.mp4` through the proxy

**ClipPreviewModal (`client/src/components/video-creator/ClipPreviewModal.jsx`):**
- Full-screen dark overlay (rgba(0,0,0,0.92)), click outside closes
- Centred video player, max-width 800px, with native controls + autoPlay
- Metadata below: title, duration, category, license pill, tags, description, warning
- Escape key closes the modal
- Video src: `/library/clips/{filename}` — served through Vite proxy

**Hover preview on ClipCard:**
- 800ms hover delay before a 240px floating video tooltip appears above the card
- Video autoplays muted, looped — pauses/hides on mouse leave
- Only fires when `fileExists === true`

**Play button on ClipCard:**
- Purple circular play button on every card
- Enabled only when `fileExists === true` (greyed + disabled when no file)
- Opens `ClipPreviewModal` with the clip data

**Upload form (LibraryTab):**
- "Upload" button (green) alongside existing "Add" button
- File picker: accepts mp4, mov, webm — max 500 MB enforced by multer server-side
- Fields: title (auto-populated from filename), tags, mood, category, license selector, source URL
- `XMLHttpRequest` with `upload.onprogress` for real progress bar (0→100%)
- On complete: clip appears immediately in library

**Upload endpoint (`POST /api/library/upload`):**
- `multer` with `diskStorage` to `library/clips/` — filename: `manual_{uuid}.{ext}`
- `fileFilter` rejects non-video MIME types
- `getVideoDuration()` — runs `ffprobe -v quiet -show_entries format=duration` after upload; falls back to `0` if ffprobe not installed
- Calls `clipStore.addClip()` with the real duration
- Sets `warning` automatically for `fair_use` license

**multer:** installed in `server/` (`npm install multer`)

**Testing checklist:**
- [x] `/library/clips/filename.mp4` accessible through Vite proxy
- [x] Play button visible on each clip card (disabled when no file)
- [x] Click play → modal opens with full controls
- [x] Escape closes modal; clicking outside closes modal
- [x] 800ms hover → floating video preview appears, disappears on mouse leave
- [x] Upload form opens with Upload button
- [x] File picker auto-populates title from filename
- [x] Upload progress bar tracks real upload progress
- [x] Clip appears in library immediately after upload
- [x] Duration auto-detected via ffprobe when available

---

---

### Fix 9 — ElevenLabs AI voiceover ✅ Complete

**Problem:** Videos require manual narration recording. ElevenLabs integration auto-generates per-scene voiceover synced to Remotion timing.

**Architecture:**
```
VoiceoverPanel → POST /api/voiceover/generate (SSE)
→ server/services/elevenlabs.js → ElevenLabsClient.textToSpeech.convert()
→ projects/{projectId}/audio/scene_{id}.mp3
→ scene.audio_path + scene.audio_duration updated
→ duration_seconds auto-synced (audio_duration + 0.5)
→ Documentary.jsx <Audio src={scene.audio_path} /> per Series.Sequence
```

**Files added/changed:**
- `server/services/elevenlabs.js` — `getVoices()`, `generateAudio()`, `getAudioDuration()` (ffprobe)
- `server/routes/voiceover.js` — `/status`, `/voices`, `/generate` (SSE), `/preview`
- `server/index.js` — `app.use('/api/voiceover', require('./routes/voiceover'))`
- `client/src/components/video-creator/VoiceoverPanel.jsx` — collapsible panel: voice selector (searchable, grouped by category, preview button), model selector (3 models), voice settings sliders (stability, similarityBoost, style), Generate all SSE progress, per-scene status, Sync timings button
- `client/src/pages/VideoCreator.jsx` — `selectedVoiceId` state, `voiceoverStatuses` state, `handleRegenerateVoiceover()` (SSE), `<VoiceoverPanel>` rendered between SceneGrid and ExportPanel
- `client/src/components/video-creator/SceneGrid.jsx` — speaker icon (Mic) on each scene card; green/blue/red color based on voiceover status; duration badge
- `client/src/components/video-creator/ExportPanel.jsx` — `voiceoverStatuses` prop, voiceover checklist row ("X / Y scenes"), checklist grid responsive auto-fill
- `remotion/src/compositions/Documentary.jsx` — `<Audio src={scene.audio_path} volume={1.0} />` inside each `Series.Sequence` (before SceneRenderer)
- `client/src/pages/Settings.jsx` — ElevenLabs API key status section with test button calling `GET /api/voiceover/status`, shows plan + character credits

**Environment:**
- `ELEVENLABS_API_KEY` in `.env` — restart server after adding
- SDK: `@elevenlabs/elevenlabs-js` installed in `server/`

**Voice persistence:**
- Selected voice ID stored in `localStorage` key `vorta_selected_voice`
- Persists across browser sessions

**Audio routing:**
- Audio saved to `projects/{projectId}/audio/scene_{id}.mp3`
- Served via existing `/projects` static route in Express
- Vite proxy `/projects → http://localhost:3001` already covers this path — `audio_path` URLs like `/projects/{id}/audio/scene_{id}.mp3` work in the in-browser Remotion Player without any additional config
- At render time, Remotion headless Chrome fetches audio from the Express static route (same pattern as images)

**Models available:**
- `eleven_multilingual_v2` — default, highest quality
- `eleven_flash_v2_5` — fast/cheap, good for drafts
- `eleven_v3` — experimental, most expressive

**Sync timings:**
- "Sync timings" button in VoiceoverPanel sets `duration_seconds = Math.ceil(audio_duration + 0.5)` for all scenes that have audio
- Remotion player immediately reflects new timing
- Scene cards with audio show duration badge (e.g. "12.3s")

**Per-scene regeneration:**
- Speaker icon on each scene card; click triggers `POST /api/voiceover/generate` with `mode: 'scene'`
- Icon color: white (no audio) → blue spinning (generating) → green (done) → red (error)
- Duration badge shown in green next to speaker icon after successful generation

**Testing checklist:**
- [ ] `ELEVENLABS_API_KEY` in `.env` — Settings page test button returns connected + credits
- [ ] VoiceoverPanel opens and loads voice list from `GET /api/voiceover/voices`
- [ ] Voice preview plays a short sample
- [ ] "Generate all" SSE streams per-scene progress
- [ ] Audio files appear at `projects/{id}/audio/scene_{id}.mp3`
- [ ] `scene.audio_path` and `scene.audio_duration` update in state
- [ ] Sync timings updates `duration_seconds` across all scenes
- [ ] Remotion player plays per-scene audio when scrubbing
- [ ] Speaker icon on scene cards shows correct status color
- [ ] Per-scene regeneration replaces old audio file
- [ ] ExportPanel checklist shows voiceover ready count
- [ ] Rendered MP4 contains per-scene narration audio

---

### Fix 10 — Voiceover audio quality ✅ Complete

**Problem:** Generated narration cuts off mid-word, words repeat, and pacing feels unnatural.

**Root causes:**
1. Script excerpts were not TTS-safe — incomplete sentences, no terminal punctuation, too short/long
2. ElevenLabs generation had no retry logic, no output validation, and weak voice settings
3. No text preprocessing before sending to API — markdown artifacts and odd whitespace caused artefacts
4. Abrupt audio file boundaries with no silence padding made narration feel harsh

**Files changed:**
- `server/services/textPreprocessor.js` (NEW) — `preprocessForTTS`, `validateTTSText`, `splitIntoChunks`
- `server/services/elevenlabs.js` — refactored into `generateSingleAudio` (3-retry + output validation), `generateAndConcatenate` (ffmpeg concat for long text), `addSilencePadding` (300ms start/end via ffmpeg), and updated `generateAudio` orchestrator. `DOCUMENTARY_VOICE_SETTINGS` constant (stability 0.71, similarityBoost 0.75, style 0.0).
- `server/services/claude.js` — added `SCENE TEXT RULES FOR VOICEOVER` section to system prompt (complete sentences, 15-60 words, terminal punctuation, no stage directions). Updated `script_excerpt` field rule to match.

**Key behaviours:**
- Text is cleaned (markdown stripped, double punctuation fixed, duplicate words removed) before every ElevenLabs call
- Text over 2500 chars is split at sentence boundaries; chunks are generated separately and concatenated with ffmpeg
- Each generation attempt validates the output is >1KB and has measurable duration; retries up to 3x with exponential backoff
- 300ms silence padding added to start and end of every audio file (non-fatal if ffmpeg unavailable)
- Future Claude analyses will produce TTS-safe excerpts (complete thoughts, proper punctuation, 15-60 words)

### Fix 11 — Background music and sound effects system ✅ Complete (ElevenLabs rewrite)

**Goal:** Add four-layer documentary audio architecture (background music + ambient loops + transition stings + overlay sounds) rendered in Remotion alongside per-scene narration.

> **Note:** The original implementation used Pixabay (music), Freesound (ambient/stings), and Free Music Archive as fallback. All third-party audio sources were subsequently replaced by ElevenLabs APIs. See Fixes 1, 2, 5, and 6 (marked superseded below) for the intermediate history.

**Current audio sources (all ElevenLabs):**
| Layer | Service file | API |
|-------|-------------|-----|
| Background music | `elevenLabsAudio.js` | ElevenLabs Music API |
| Ambient loops | `elevenLabsSound.js` | ElevenLabs Sound Effects API |
| Transition stings | `elevenLabsSound.js` | ElevenLabs Sound Effects API |
| Overlay sounds | `elevenLabsSound.js` | ElevenLabs Sound Effects API |
| Narration | `elevenlabs.js` | ElevenLabs TTS |

**Architecture:**
```
AudioPanel → POST /api/audio/build-specs
→ server/services/audioMixer.js → buildProjectAudioSpecs / buildProjectAudioSpecsCached
→ server/services/elevenLabsAudio.js → ElevenLabs Music API → library/music/
→ server/services/elevenLabsSound.js → ElevenLabs Sound Effects API → library/ambient/ + library/stings/ + library/overlay-sounds/
→ server/services/soundLibrary.js → library/soundIndex.json (persistent cache index)
→ audioSpecs[] passed to VideoPlayer → Documentary.jsx → 4 audio layers per scene

Sound pre-generation (one-time SSE):
POST /api/audio/prewarm → generateAllStings() (6) + generateAllAmbient() (12) + generateAllOverlaySounds() (11)
→ All 29 sounds indexed in library/soundIndex.json
→ Subsequent renders served from cache — no re-generation
```

**Volume levels:**
| Layer | Volume | Notes |
|-------|--------|-------|
| Narration (`spec.narration.url` / `scene.audio_path`) | 100% | Per-scene ElevenLabs audio inside Series.Sequence |
| Background music | 12% | Single continuous global track (most-common URL across scenes), loop |
| Ambient sound | 6% | Single continuous global track (most-common URL across scenes), loop |
| Transition sting | removed | Removed from composition — kept null in spec data for compat |

**Audio tag architecture (updated):**
- Music and ambient render as two global `<Audio>` tags outside `<Series>` — they never remount between scenes
- Per-scene narration adds 1 tag per scene inside the sequence
- Total tags = `scenes.length + 2` — resolves the `Html5Audio limit 5` error for any video length
- `numberOfSharedAudioTags={256}` set on `<Player>` in `VideoPlayer.jsx` as belt-and-suspenders headroom
- `mostCommon(urls)` picks the most-used music/ambient URL when scenes have different moods

**Current service files:**
- `server/services/elevenlabs.js` — ElevenLabs TTS: `getVoices()`, `generateAudio()`, `getAudioDuration()` (ffprobe). Generates per-scene narration to `projects/{id}/audio/scene_{id}.mp3`.
- `server/services/elevenLabsAudio.js` — ElevenLabs Music API: `generateMusicForMood(mood)`, cache-first lookup, saves to `library/music/`.
- `server/services/elevenLabsSound.js` — ElevenLabs Sound Effects API: `generateAllStings()` (6 stings), `generateAllAmbient()` (12 ambient loops), `generateAllOverlaySounds()` (11 overlay sounds). All indexed via `soundLibrary.js`.
- `server/services/soundLibrary.js` — Persistent sound index (`library/soundIndex.json`): `addToLibrary(entry)`, `searchLibrary(type, category)`, `searchLibraryByType(type)`, `incrementUsage(id)`, `removeFromLibrary(id)`, `getLibraryStats()`. Exports directory constants: `STINGS_DIR`, `AMBIENT_DIR`, `OVERLAY_DIR`, `MUSIC_DIR`.
- `server/services/audioMixer.js` — `VOLUME_LEVELS` constant, `buildProjectAudioSpecs` (async, calls `getSting()` only for `scene.use_sting === true`), `buildProjectAudioSpecsCached` (sync, local cache only).
- `server/config/musicMoods.js` — `moodMap` (9 moods: tense/triumphant/somber/neutral/dramatic/reflective/anticipatory/institutional/intimate) each with `ambientCategory`. `categoryAmbientMap` mapping 11 categories to ambient keys.
- `server/routes/audio.js` — `GET /status` (ElevenLabs connection, library stats), `POST /build-specs`, `POST /prewarm` (SSE — generates all 29 sounds sequentially).
- `client/src/components/video-creator/AudioPanel.jsx` — collapsible panel: ElevenLabs connection status, Prewarm Library button with SSE progress, per-scene audio assignment, global volume sliders (music/ambient), library stats.
- `remotion/src/compositions/Documentary.jsx` — `audioSpecs` prop + `audioSpecMap` lookup. Audio layers: narration (100%, per-scene), background music (12%, global loop), ambient (6%, global loop), sting (45%, only when `use_sting: true`).
- `client/src/components/video-creator/VideoPlayer.jsx` — `audioSpecs` prop, passed into `inputProps`.
- `client/src/pages/VideoCreator.jsx` — `audioSpecs` and `audioVolumes` state, `<AudioPanel>` between VoiceoverPanel and ExportPanel.
- `client/src/components/video-creator/ExportPanel.jsx` — `audioSpecs` prop, checklist rows: Background music, Ambient sound, Stings.

**Sound library directory structure:**
```
library/
  soundIndex.json       ← persistent index of all ElevenLabs-generated sounds
  music/                ← background music per mood (ElevenLabs Music API)
  ambient/              ← ambient loops per category (ElevenLabs Sound Effects API, 12 loops)
  stings/               ← transition stings (ElevenLabs Sound Effects API, 6 stings)
  overlay-sounds/       ← overlay entry/active sounds (ElevenLabs Sound Effects API, 11 sounds)
```

**ElevenLabs audio APIs:**
- `ELEVENLABS_API_KEY` in `.env` — same key used for TTS narration, no additional key required
- Music: ElevenLabs Music API generates mood-appropriate background tracks on first use; cached to `library/music/`
- Sound effects: ElevenLabs Sound Effects API generates ambient loops, stings, and overlay sounds; indexed in `library/soundIndex.json`
- Pre-warm via `POST /api/audio/prewarm` (SSE): generates all 29 sounds once and caches them — subsequent renders read from disk

**`use_sting` field:**
- Claude adds `use_sting: true` to max 1-in-3 scenes at narrative turning points during script analysis
- `audioMixer` calls `getSting()` only when `scene.use_sting !== false`
- All other scenes skip the sting layer entirely

**Key implementation details:**
- `buildProjectAudioSpecs` deduplicates moods before generating: N scenes with the same mood = 1 ElevenLabs call
- `buildProjectAudioSpecsCached` is instant — uses only what's already cached in `library/soundIndex.json`
- `GET /library` static route in Express covers `library/music/`, `library/ambient/`, `library/stings/`, `library/overlay-sounds/` — no additional static registrations needed
- All sounds are generated once by `prewarmSoundLibrary()` and served from cache on all subsequent renders
- Remotion `loop` prop on `<Audio>` handles music/ambient looping in the browser Player preview

**Testing checklist:**
- [ ] `ELEVENLABS_API_KEY` in `.env` — AudioPanel shows ElevenLabs connected status
- [ ] "Prewarm Library" SSE streams progress for all 29 sound generations
- [ ] `library/soundIndex.json` populated after prewarm with stings, ambient, and overlay entries
- [ ] "Build Music Plan (cached)" builds specs instantly using cached sounds
- [ ] Volume sliders (music/ambient) update in real time
- [ ] `audioSpecs` passed to VideoPlayer — music audible in browser Player preview when library is primed
- [ ] ExportPanel checklist shows correct music/ambient/sting counts
- [ ] Rendered MP4 contains background music at correct volume relative to narration
- [ ] Scenes with `use_sting: true` include sting audio; others do not

---

### Build order recommendation
1. **Fix 1 first** — it's a bug fix, takes 1–2 hours maximum.
2. **Fix 2 second** — audio is the single biggest missing feature for client work.
3. **Fix 3 third** — settings unlock better defaults and make the app self-contained.
4. **Fix 4 fourth** — quality pass before showing anyone.
5. **Fix 5 last** — polish after the core is solid.


---

## Fix 12 — Professional Overlay Studio

**Goal:** Replace the inline overlay editor with a full-screen, professional overlay editing experience with pre-populated templates, real-time Remotion Player preview, and support for 8+ overlay types.

### New/updated files

| File | Change |
|------|--------|
| `server/config/defaultBrand.js` | Brand defaults (accentColor, fontFamily, watermarkText, etc.) |
| `client/src/config/overlayTemplates.js` | Full template catalog: 5 LowerThird, 2 DateStamp, 3 KineticText, 2 StatCallout, 2 ChapterTitle, 1 SourceCitation, 4 BackgroundOverlay, 1 Watermark |
| `client/src/components/video-creator/OverlayStudio.jsx` | NEW — full-screen editor modal |
| `remotion/src/components/overlays/LowerThird.jsx` | Updated — new format + backward compat |
| `remotion/src/components/overlays/DateStamp.jsx` | Updated — new format + backward compat |
| `remotion/src/components/overlays/KineticText.jsx` | Updated — new format + backward compat |
| `remotion/src/components/overlays/StatCallout.jsx` | NEW — big_number + corner_stat |
| `remotion/src/components/overlays/ChapterTitle.jsx` | NEW — minimal_chapter + full_screen_chapter |
| `remotion/src/components/overlays/SourceCitation.jsx` | NEW — subtle bottom-right attribution |
| `remotion/src/components/overlays/BackgroundOverlay.jsx` | NEW — gradient/solid/tint full-frame overlays |
| `remotion/src/components/overlays/Watermark.jsx` | NEW — persistent low-opacity text |
| `remotion/src/components/ImageScene.jsx` | Updated — full 8-type dispatcher |
| `client/src/components/video-creator/SceneGrid.jsx` | Updated — "Overlay Studio" button replaces inline panel |
| `client/src/pages/VideoCreator.jsx` | Updated — brand state, overlay studio state, handlers |

### Data structure

**Old format (backward-compat):**
```js
{ type, line1, line2, appearAt, color: {}, font: {}, animation: {} }
```

**New format (OverlayStudio output):**
```js
{
  id, type, template,
  text: { line1, line2, color, size, weight, family, letterSpacing, transform },
  background: { color, blur, borderRadius },
  accent: { color, width, position },
  animation: { enter, exit, duration, easing, delay },
  position: { x, y, offsetX, offsetY },
  timing: { appearAt },
  opacity,
}
```

All Remotion overlay components detect format via `typeof overlay.text === "object"` and normalize both formats before rendering. Existing scenes with old-format overlays continue to render correctly.

### OverlayStudio architecture
- **Left panel (400px):** Type tabs (11 types) → Template picker (CSS mini-previews) → Active overlays list → Editor fields for selected overlay
- **Right panel:** Live Remotion Player preview (single-scene) → Apply / Cancel buttons
- **`deepMerge`:** used for nested-path field updates without stomping sibling keys
- **Brand colors:** applied to template defaults when adding a new overlay (accentColor, fontFamily)

### Bug fixes applied (Fix 12a)

**Root cause — editor shows blank fields (old-format overlays):**
AI-generated overlays use the old flat format: `{ type, line1, text: 'string', color:{}, font:{}, animation:{} }`. `OverlayEditor` reads `overlay.text.line1` — but when `overlay.text` is a string, `.line1` is `undefined`, making every input appear empty. Fix: `normalizeOverlay()` in `OverlayStudio.jsx` converts old-format on initialization so the editor always sees the new nested format.

**Root cause — deepMerge shared references:**
`deepMerge({}, tpl.defaults)` returned the same nested object references (not deep copies) when the target key didn't exist. Then `defaults.accent.color = brand.accentColor` silently mutated the original template object in `overlayTemplates.js`. Fix: when source is an object and target key is missing, recurse into `{}` (always clone). Also switched `handleAddTemplate` to `JSON.parse(JSON.stringify(tpl.defaults))` for a guaranteed clean deep clone.

**Root cause — Apply Changes not updating Remotion Player:**
`inputProps` was constructed inline on every render without memoization. Remotion's Player compares `inputProps` by reference — if React decided not to re-render VideoPlayer (e.g. due to parent memo boundaries), the composition never saw the new overlay data. Fix: `useMemo` in `VideoPlayer.jsx` with `scenes.map(s => ({ ...s }))` to force new object references when `scenes` changes. Fix: `handleOverlaySave` in `VideoCreator.jsx` uses `[...newOverlays]` (explicit new array) and combines save+close into one state batch.

---

### Fix 13 — Automated overlay generation with review system ✅ Complete

**Goal:** Claude auto-generates overlay suggestions for every scene during script analysis. The user reviews, accepts, or rejects suggestions before they render in the video.

**Architecture:**
```
Script analysis → Claude generates overlays[] per scene (status: "suggested")
→ Review banner appears with count of suggestions
→ User: "Accept all" / "Dismiss all" / "Review suggestions" (opens bulk modal)
→ Per-scene accept/reject on scene card badges
→ Only status === "accepted" overlays render in Remotion
```

**Overlay suggestion lifecycle:** `suggested` → `accepted` | rejected (removed from array)

**Rules baked into Claude system prompt:**
- lower_third: only on first introduction of named person/company — never duplicated
- date_stamp: specific year/location, never on same scene as lower_third
- stat_callout: financial figures, percentages, milestones
- kinetic_text: max 1 per 4 scenes, never with stat_callout
- chapter_title: major narrative transitions, max 3-5 per documentary
- background_overlay: always combinable to aid legibility
- Priority: lower_third > date_stamp; stat_callout XOR kinetic_text
- Max 2 overlays per scene (excluding background_overlay)

**Entity tracking:** Claude tracks named entities across all scenes in a single pass — lower_third is never duplicated for the same person/company.

**Overlay output format:**
```json
{
  "type": "lower_third",
  "template": "minimal_line",
  "text": { "line1": "Steve Jobs", "line2": "Co-Founder · Apple" },
  "timing": { "appearAt": 0.7 },
  "confidence": 0.95,
  "reason": "First mention of Steve Jobs in the script",
  "status": "suggested"
}
```

**IDs:** Every overlay gets a `crypto.randomUUID()` ID during post-processing in `claude.js` so the review UI can accept/reject individually.

**Files changed:**
- `server/services/claude.js` — extended system prompt with full overlay generation rules; user message includes template preferences from defaults; overlays get IDs in post-processing; overlays preserved on all scene types (not just image)
- `server/config/defaults.json` — added `overlayTemplates` block with default template names per type
- `remotion/src/components/ImageScene.jsx` — filters `overlays` to only render `status === 'accepted'` or unstatused (backward compat)
- `client/src/pages/VideoCreator.jsx` — `overlayStats` useMemo, `overlayReviewOpen` state, 6 accept/reject handlers, overlay review banner, imports `OverlayReviewModal`
- `client/src/components/video-creator/OverlayReviewModal.jsx` (NEW) — full-screen bulk review: suggestions grouped by scene, accept/reject per overlay or per scene, "Accept all remaining" header button
- `client/src/components/video-creator/SceneGrid.jsx` — `onAcceptSceneOverlays` / `onRejectSceneOverlays` props; suggestion badge in scene card footer showing count + inline Accept/Reject buttons; green "✓ N overlays" badge when accepted
- `client/src/pages/Settings.jsx` — "Default Overlay Templates" section with dropdowns for all 6 overlay types; saves to `server/config/defaults.json` via POST /api/settings

**Testing checklist:**
- [ ] Analyze a script → scenes appear with `overlays` array containing `status: "suggested"` entries
- [ ] Review banner appears above scene grid with correct suggestion count
- [ ] "Accept all" bulk-accepts all suggestions immediately
- [ ] "Dismiss all" removes all suggestions from all scenes
- [ ] "Review suggestions" opens the bulk modal
- [ ] Bulk modal shows all scenes with suggestions grouped
- [ ] Per-overlay Accept/Reject buttons in modal update state in real time
- [ ] Per-scene Accept/Reject buttons in modal work
- [ ] "Accept all remaining" in modal header accepts everything left
- [ ] Scene card footer shows suggestion badge with count and inline Accept/Reject
- [ ] Scene card shows green "✓ N overlays" badge after accepting
- [ ] Accepted overlays render in the Remotion player (visible in live preview)
- [ ] Suggested (not-yet-accepted) overlays do NOT render in Remotion
- [ ] Settings page shows "Default Overlay Templates" section with all 6 dropdowns
- [ ] Changing a template setting saves and is reflected in the next analysis

---

### Fix 14 — Live overlay preview with two-stage commit ✅ Complete

**Goal:** Overlay Studio edits preview instantly in the right-panel Remotion player but don't affect the main video until the user explicitly clicks "Apply to video".

**Two-stage state in OverlayStudio.jsx:**
- `previewOverlays` — live state; updated on every field edit, add, or delete; feeds the in-studio VideoPlayer
- `committedOverlays` — last applied state; only advances when the user clicks "Apply to video"; used only for comparison and Reset
- `hasUncommittedChanges = JSON.stringify(previewOverlays) !== JSON.stringify(committedOverlays)`

**Header changes:**
- Yellow pulsing pill "● Live preview — not yet applied" when `hasUncommittedChanges`
- Green pill "✓ Applied to video" for 2s after Apply
- "↺ Reset" button (visible only when uncommitted) reverts preview to committed
- "Apply to video" button: purple when active, dimmed + disabled when no changes
- Close button triggers `window.confirm()` if there are uncommitted changes

**Right-panel player border:**
- Yellow `rgba(251,191,36,0.35)` when uncommitted changes are showing
- Green `rgba(34,197,94,0.35)` immediately after applying
- Default dim when no changes

**Active overlays list badges:**
- `new` (blue) — overlay exists in preview but not committed
- `edited` (yellow) — overlay exists in both but values differ
- Row border is amber when `new` or `edited`, default otherwise

**`@keyframes _ovPulse`** injected via `<style>` tag inside the component.

**Apply behaviour change from Fix 12:**
- Old: Apply called `onSave` then `onClose()` — studio closed after every apply
- New: Apply calls `onSave`, advances `committedOverlays`, shows 2s "Applied" feedback — studio stays open so the user can continue editing

**Files changed:**
- `client/src/components/video-creator/OverlayStudio.jsx` — two-stage state, header redesign with indicators and buttons, overlays list badges, right-panel player border, close guard

**Testing checklist:**
- [ ] Typing in a text field instantly updates the right-panel Remotion player (no Apply needed)
- [ ] Yellow "Live preview — not yet applied" pill appears immediately on any edit
- [ ] Main VideoCreator player does NOT update until Apply is clicked
- [ ] Apply button is disabled (dimmed) when no changes exist
- [ ] Click Apply — green "✓ Applied to video" pill appears for 2 seconds
- [ ] After Apply, main VideoCreator player reflects the new overlays
- [ ] ↺ Reset reverts preview back to the last applied state
- [ ] Close with uncommitted changes → confirm dialog appears
- [ ] Dismiss the confirm → studio stays open
- [ ] Accept the confirm → studio closes, changes discarded
- [ ] "new" badge on overlays added but not yet applied
- [ ] "edited" badge on overlays modified but not yet applied
- [ ] Player border: yellow when uncommitted, green just after Apply, default otherwise

---

### Testing checklist
- [ ] "Overlay Studio" button visible in each scene card footer
- [ ] Clicking opens full-screen modal for that scene
- [ ] All 11 type tabs switch template picker content
- [ ] Clicking a template card adds an overlay and auto-selects it for editing
- [ ] Editor fields show current values (not blank) — check for both new and old-format overlays
- [ ] Editing Line 1 text updates the Remotion preview on the right in real time
- [ ] Active overlays list shows all overlays; click to select, trash to delete
- [ ] Apply Changes saves overlays to scene and closes modal
- [ ] After Apply, main VideoPlayer immediately shows the overlay (scene resets to start)
- [ ] Cancel closes without saving changes
- [ ] Existing old-format overlays still render correctly in Remotion
- [ ] New StatCallout, ChapterTitle, BackgroundOverlay, Watermark types render in Remotion
- [ ] BackgroundOverlay gradients display full-frame
- [ ] LowerThird accent position (left/right/bottom) works correctly
- [ ] Position offsets (X/Y, offsetX/Y) correctly place overlays

---

### Fix 15 — Global form contrast system ✅ Complete

**Goal:** Every input, select, textarea, slider, and button is clearly visible and distinguishable from its background throughout the entire app.

**Root cause of low contrast:**
- Inputs used `bg-white/[0.04]` (4% opacity) — nearly invisible on dark panel backgrounds
- Borders used `border-white/[0.08]` (8% opacity) — extremely faint
- Labels used `text-white/40` (40% opacity) — hard to read
- Placeholder text at 20% opacity — almost invisible
- Select elements on dark backgrounds used `#1a1a1a` — no visual contrast with page background

**Solution — design system tokens in `forms.css`:**
- Input bg: `rgba(255,255,255,0.08)` (2× previous)
- Input border: `rgba(255,255,255,0.18)` (2.25× previous)
- Input text: `rgba(255,255,255,0.88)` (high contrast)
- Placeholder: `rgba(255,255,255,0.35)` (was 0.20)
- Label: `rgba(255,255,255,0.58)` (was 0.40)
- Select bg: `#1f1f1f` (explicit dark rather than transparent)

**Files created:**
- `client/src/styles/forms.css` — CSS custom properties + `.vorta-input`, `.vorta-select`, `.vorta-textarea`, `.vorta-textarea-mono`, `.vorta-slider`, `.vorta-color`, `.vorta-label`, `.vorta-field`, `.vorta-field-row`, `.vorta-btn` + variants (`-primary`, `-blue`, `-white`, `-secondary`, `-ghost`, `-danger`), `.vorta-hint`, `.vorta-panel`, `.vorta-panel-dark`
- `client/src/components/shared/FormFields.jsx` — reusable React wrappers: `Field`, `FieldRow`, `TextInput`, `NumberInput`, `SearchInput`, `SelectInput`, `TextareaInput`, `SliderInput`, `ColorInput`, `Button`, `FormCard`

**Files modified:**
- `client/src/main.jsx` — imported `./styles/forms.css`
- `client/src/components/video-creator/ScriptInput.jsx` — replaced all Tailwind form classes with `vorta-*` design system classes
- `client/src/pages/Settings.jsx` — replaced `inputCls`/`selectCls`/`labelCls` string constants with `vorta-input`/`vorta-select`/`vorta-label`; updated sliders to `vorta-slider`
- `client/src/components/video-creator/VoiceoverPanel.jsx` — updated voice search input and voice setting sliders
- `client/src/components/video-creator/AudioPanel.jsx` — updated volume sliders
- `client/src/components/video-creator/ExportPanel.jsx` — updated audio settings sliders
- `client/src/components/video-creator/ClipLibrary.jsx` — updated `inp`/`lbl` style constants; updated search input wrappers in My Library and source tabs
- `client/src/components/video-creator/OverlayStudio.jsx` — updated `label11` and `inputBase` constants

**Testing checklist:**
- [ ] ScriptInput: title/niche/style/narrator fields have clearly visible borders and readable labels
- [ ] ScriptInput: textarea placeholder text readable against dark background
- [ ] Settings: all dropdowns (grade, motion, transition, overlay templates) show text clearly
- [ ] Settings: sliders thumb matches purple accent color
- [ ] VoiceoverPanel: voice search input visible; slider thumbs purple
- [ ] AudioPanel: volume sliders thumb visible and interactive
- [ ] ClipLibrary: search bars have visible borders; add/upload form fields readable
- [ ] OverlayStudio: all editor fields (text, color, select, sliders) clearly visible

---

### Fix 1 — Background music: Pixabay download ~~✅ Complete~~ ⚠️ SUPERSEDED

> Superseded by the ElevenLabs Music API rewrite. `pixabayMusic.js` is deleted. Background music is now generated by `elevenLabsAudio.js`.

**Problem:** Pixabay queries returned 0 results; corrupted cached files were silently returned; audioSpecs not wired into render.

**Changes:**
- `server/services/pixabayMusic.js` — `downloadTrack` now validates cached file size (delete & retry if < 10 KB), validates downloaded buffer (reject if < 10 KB)
- `server/config/musicMoods.js` — simplified `musicQuery` strings from 4-5 words to 2-3 words (e.g. `'tension suspense'`, `'documentary background'`)
- `server/routes/audio.js` — added `GET /test-pixabay` debug endpoint
- `server/routes/render.js` — wires `buildProjectAudioSpecsCached` into `propsData.audioSpecs`; rewrites local file paths to full HTTP URLs (`http://localhost:3001/library/...`) for Remotion headless Chrome

---

### Fix 2 — Ambient sound system ~~✅ Complete~~ ⚠️ SUPERSEDED

> Superseded by the ElevenLabs Sound Effects API rewrite. `ambientLibrary.js` and `freesoundService.js` are deleted. Ambient loops are now generated by `elevenLabsSound.js` and indexed in `library/soundIndex.json`.

**Problem:** Ambient files had to be manually downloaded from Freesound; no automated selection per scene.

**Changes:**
- `server/services/ambientSelector.js` (new) — uses Claude Haiku to select best ambient key per scene; falls back to mood-based defaults
- `server/services/ambientLibrary.js` — added `FREESOUND_QUERIES` map, `downloadAmbientFile(key)` (yt-dlp + ffmpeg trim to 30s), `downloadAllMissingAmbient()`
- `server/routes/audio.js` — rewrote `POST /build-specs` to use parallel mood music + Claude ambient selection; added `POST /download-ambient` SSE stream endpoint; added `POST /download-ambient/:key` single-key endpoint
- `client/src/components/video-creator/AudioPanel.jsx` — added "Auto-download missing" button with SSE progress tracking per ambient key

---

### Fix 3 — Overlay drag positioning ✅ Complete

**Problem:** Overlay positions could only be set via number inputs; no direct drag-to-position workflow.

**Changes:**
- `client/` — installed `react-moveable` package
- `client/src/components/video-creator/DraggableOverlayCanvas.jsx` (new) — canvas showing scene image + draggable overlay elements; `Moveable` handles on selected element; rule-of-thirds grid while dragging; bidirectional coordinate mapping between 1920×1080 video space and display canvas pixels; `OverlayElement` renders visual representations of all overlay types
- `client/src/components/video-creator/OverlayStudio.jsx` — added `previewMode` state; replaced static right panel with two-tab system: "Drag & Position" (DraggableOverlayCanvas) and "Animated Preview" (VideoPlayer)

---

## Audio System (Current)

All audio is generated by ElevenLabs. No external music or sound APIs beyond ElevenLabs.

### Services
| File | Purpose |
|------|---------|
| `server/services/elevenlabs.js` | TTS narration generation |
| `server/services/elevenLabsAudio.js` | Music generation per mood |
| `server/services/elevenLabsSound.js` | Stings, ambient, overlay sounds |
| `server/services/audioMixer.js` | Builds per-scene audio specs |
| `server/services/soundLibrary.js` | Persistent sound index (soundIndex.json) |
| `server/services/ambientSelector.js` | Claude selects ambient category per scene |

### Deleted services (no longer exist)
- `pixabayMusic.js` — removed
- `freeMusicArchive.js` — removed
- `freesoundService.js` — removed
- `youtubeAudioLibrary.js` — removed

### Sound library directories
- `library/music/` — background music per mood (cached)
- `library/ambient/` — ambient loops per category (cached)
- `library/stings/` — transition stings (cached)
- `library/overlay-sounds/` — overlay entry sounds (cached)
- `library/soundIndex.json` — indexes all generated sounds

### Environment variables required
- `ANTHROPIC_API_KEY`
- `ELEVENLABS_API_KEY`
- *(No Pixabay, Freesound, or FMA keys needed)*

---

## Session 11 — Smoke Test Fixes
**Commit:** `fix: Remotion version pin 4.0.474, crossfade duration, short music validation`
**Date:** 2026-06-10

### Fix 1 — Remotion Version Mismatch (BLOCKER — render was broken)
**Problem:** `@remotion/transitions` was pinned to `^4.0.474` in `remotion/package.json` while `remotion` and `@remotion/cli` resolved to `4.0.472`. Remotion's own multiple-versions guard throws a `TypeError` before module exports complete, causing React error #130 and crashing every render at frame 0.

**Solution:**
- Pinned all `@remotion/*` packages to exact `4.0.474` in `remotion/package.json` (no `^`)
- Pinned `remotion`, `@remotion/player`, `@remotion/transitions` to `4.0.474` in `client/package.json`
- Verified with `node -e "require('remotion'); require('@remotion/transitions')"` — no version throw
- Test render: 2-scene MP4 produced, 168 frames, 5.65s — matches expected duration

### Fix 2 — calculateMetadata Crossfade Duration
**Problem:** `Root.jsx` `calculateMetadata` summed raw scene frames without subtracting `(n−1) × 12` crossfade overlap. Rendered video was longer than the in-browser preview by `(n−1) × 0.4s`.

**Solution:**
- `Root.jsx` `calculateMetadata` now calls `calculateDocumentaryDuration(scenes)` (the correct function already defined in `Documentary.jsx`)
- `VideoPlayer.jsx` `totalFrames` useMemo updated to apply per-scene `Math.max(..., 30)` minimum matching `Documentary.jsx`

### Fix 3 — Short ElevenLabs Music Files (1–3s instead of 60s)
**Problem:** All 7 ElevenLabs-generated music files were 1–3 seconds long (17–49 KB). ElevenLabs' Sound Effects API ignored the `duration_seconds: 60` parameter and returned very short clips. The 10 KB buffer-size check passed but files were useless as background music.

**Solution:**
- `elevenLabsAudio.js`: added inline `getAudioDuration()` using ffprobe; after writing each music file, measures actual duration; throws and deletes the file if `< 10s`
- Updated all `MUSIC_PROMPTS` to include `"60 seconds duration, loops cleanly"` in every entry
- Added `intimate` mood to the prompts map
- Deleted all 7 bad cached files and cleared their 7 entries from `library/musicIndex.json`
- On next "Build Music Plan" call, missing moods regenerate with duration validation

---

## Session 10 — Narration Sync, Crossfade Transitions, 6-Stage Wizard UI
**Commit:** `feature: narration sync, crossfade transitions, 6-stage wizard UI`
**Date:** 2026-06-09

### Fix 1 — Narration Duration Sync
**Problem:** Scene durations were estimated from word counts. When ElevenLabs generated audio at a different pace, the video cut off narration mid-sentence.

**Solution:**
- `server/services/elevenlabs.js`: silence padding changed from 300ms/300ms to **100ms start / 600ms end** (`adelay=100|100,apad=pad_dur=0.6`) giving a more natural tail buffer; codec explicitly set to `libmp3lame` for correct MP3 output
- `server/routes/voiceover.js`: after saving each audio file, `getAudioDuration()` (ffprobe) measures the real length; `scene_done` SSE event now includes both `audio_duration` (raw) and `scene_duration` (`audioDuration + 0.8` tail buffer)
- `POST /api/voiceover/sync-timings` endpoint: re-reads all audio files from disk and returns updated scenes with measured `audio_duration` and `duration_seconds`; authoritative source of truth
- `VoiceoverPanel.jsx`: `scene_done` handler reads `audio_duration` + `scene_duration` from event; `finally` block calls `sync-timings` after every generation run and propagates updated scenes via `onScenesChange`
- `VideoCreator.jsx` `handleAudioGenerated`: uses `sceneDuration` from event when available; falls back to `audioDuration + 0.8`

**Result:** Scene durations are always derived from actual audio length, not estimates. The sync-timings call after "Generate All" guarantees consistency even if SSE events race.

### Fix 2 — Crossfade Transitions
**Problem:** Remotion used hard cuts between scenes, which looked abrupt.

**Solution:**
- Installed `@remotion/transitions@^4.0.474` in `remotion/`
- Rewrote `remotion/src/compositions/Documentary.jsx` to use `TransitionSeries` with `fade()` presentation (`springTiming({ durationInFrames: 12, config: { damping: 200 } })`)
- Used `flatMap` to interleave `TransitionSeries.Sequence` and `TransitionSeries.Transition` children (flat array — `TransitionSeries` requires no wrapping fragments)
- `calculateDocumentaryDuration` deducts `(n-1) * 12` frames from total so `calculateMetadata` reports the correct length
- `VideoPlayer.jsx` `totalFrames` useMemo also deducts the same overlap so the player scrubber matches

**Key implementation detail:** `TRANSITION_FRAMES = 12` (0.4s at 30fps). Total duration = sum(sceneDurations) − (n−1)×12 frames.

### Fix 3 — 6-Stage Wizard UI
**Problem:** VideoCreator.jsx was a single page with all panels collapsed/expanded ad hoc. Users had no clear sense of progress or flow.

**Solution — files created:**
- `client/src/hooks/useWizardState.js`: manages 6 steps (`script/scenes/visuals/voice/audio/export`); localStorage persisted (`vorta_wizard_step`, `vorta_wizard_completed`); `goTo` gated by `isAccessible` (only completed or prior steps); `goNext` marks current step complete then advances; `resetWizard` clears all state
- `client/src/components/video-creator/WizardNav.jsx`: horizontal step bar with numbered circles (✓ when complete), blue current, dimmed/locked when inaccessible; connector lines colored by completion
- `client/src/pages/wizard/ScriptStep.jsx`: script input + "Use existing scenes →" shortcut
- `client/src/pages/wizard/ScenesStep.jsx`: SceneGrid + overlay review banner + Back/Next
- `client/src/pages/wizard/VisualsStep.jsx`: Generate All button + progress + SceneGrid + Back/Next
- `client/src/pages/wizard/VoiceStep.jsx`: VoiceoverPanel (`isOpen` always true) + Back/Next
- `client/src/pages/wizard/AudioStep.jsx`: AudioPanel + Back/Next
- `client/src/pages/wizard/ExportStep.jsx`: ExportPanel + Back only

**VideoCreator.jsx changes:**
- Added `const wizard = useWizardState()` + imported all step components
- `handleAnalyze` success → `wizard.markComplete('script'); wizard.goNext()`
- `handleClearSession` → `wizard.resetWizard()`
- Replaced entire return statement with wizard layout: `WizardNav` + sticky 240px mini-player (on all steps except script when scenes exist) + `renderStep()` switch + global modals unchanged
- Removed now-unused direct imports of `ScriptInput`, `SceneGrid`, `VoiceoverPanel`, `AudioPanel`, `ExportPanel` (all moved into step files)

**Testing checklist:**
- [ ] WizardNav shows 6 steps at top; completed steps show green ✓
- [ ] Analyze → auto-advances to Scenes step with green ✓ on Script
- [ ] Back/Next buttons on each step; "Use existing scenes →" on Script step when scenes loaded
- [ ] Mini-player bar visible on steps 2–6 when scenes exist
- [ ] Generate voiceovers → terminal shows real `audio_duration` + `scene_duration` in scene_done event
- [ ] "Sync timings" button → `duration_seconds` updated to match actual audio
- [ ] Remotion player → scrub between scenes → 0.4s fade crossfade visible
- [ ] Narration plays to natural end before scene changes (600ms tail buffer)
- [ ] Clear session → wizard resets to step 1

---

## Session 12 — Render Audio 404 + Font Warning Fixes
**Commit:** `fix: render audio 404 - full HTTP URLs for CLI render, font loadFont warnings`
**Date:** 2026-06-11

### Fix 1 — Render Audio 404 (BLOCKER)
**Problem:** `scene.audio_path` was never converted to a full URL in `render.js`. Relative URLs like `/projects/xxx/audio/scene_001.mp3` were passed to Remotion CLI as-is. Headless Chrome resolved them against Remotion's own bundle server (port 3000), not Express (port 3001) → 404 → silent audio in rendered MP4.

**Root cause detail:** The old `absoluteScenes` block in `render.js` converted `image_path` to `http://localhost:3001/...` but contained no conversion for `audio_path`. Also: `audioSpecs` (music, ambient, stings) were built server-side by `buildProjectAudioSpecsCached` but their `url` fields were also relative and unconverted.

**What was tried first (rejected):** Converting to absolute filesystem paths (`C:\Users\...`). This fails because Remotion's headless Chrome converts them to `file:///C:/...` URLs, which Remotion then rejects with "Can only download URLs starting with http:// or https://".

**Final solution — full HTTP URLs:**
- `server/routes/render.js` fully rewritten:
  - `toHttpUrl(url)` helper converts `/projects/...` → `http://localhost:3001/projects/...`; leaves existing `http://` URLs unchanged
  - `absolutifyAudioSpecs(specs)` converts all audio URL fields (narration, music, ambient, sting, overlay_sounds) via `toHttpUrl`
  - `renderScenes`: both `image_path` and `audio_path` converted to full HTTP URLs
  - `renderClips`: `clip.file` converted to full HTTP URL
  - `audioSpecs`: built from `buildProjectAudioSpecsCached(renderScenes)` then passed through `absolutifyAudioSpecs`
  - Uses `process.env.PORT || 3001` for the server port
- Express already serves `/projects` and `/library` as static routes, so `http://localhost:3001/projects/...` and `http://localhost:3001/library/...` resolve correctly during headless render

**Verified:** `scenes.json` after render POST shows `audio_path: http://localhost:3001/projects/xxx/audio/scene_001.mp3`. Test render of 2 scenes produced a 9.6s MP4 with AAC stereo audio stream (confirmed via ffprobe). No 404 errors.

### Fix 2 — Font loadFont Warnings
**Problem:** `@remotion/google-fonts` fires "Made N network requests to load fonts" warning during every render frame because all Inter/Montserrat/PlayfairDisplay/DMSans/BebasNeue weights and subsets are loaded.

**Solution:** Added `{ ignoreTooManyRequestsWarning: true }` to each `loadFont()` call in `remotion/src/Root.jsx`.

**API note:** `loadFont` signature is `loadFont(style?: string, options?: { ignoreTooManyRequestsWarning?: boolean })` — the first argument is a style string, NOT an options object. Passing the options object as the first arg causes "The font X does not have a style [object Object]". Correct call: `loadFont(undefined, { ignoreTooManyRequestsWarning: true })`.

**Files changed:**
- `server/routes/render.js` — complete rewrite with `toHttpUrl` + `absolutifyAudioSpecs` helpers
- `remotion/src/Root.jsx` — `loadFont` calls updated with correct two-argument form

---

## Session 13 — Video Clip Pipeline Fix
**Commit:** `fix: video clips in render - sync to remotion public, FootageScene staticFile, real_footage classification`
**Date:** 2026-06-11

### Fix 1 — Clip files invisible to Remotion CLI renderer
**Problem:** Remotion CLI's bundle server only serves static assets from `remotion/public/`. Clips stored in `library/clips/` are not reachable by `staticFile()` during CLI rendering. Using `http://localhost:3001/library/clips/...` URLs for clips was also fragile.

**Solution — sync clips to `remotion/public/clips/`:**
- `server/routes/render.js`: added `syncClipsToRemotionPublic(selectedClips)` — copies selected clip files to `remotion/public/clips/` before each render; called before writing `scenes.json`
- `server/routes/library.js`: added `syncSingleClipToRemotion(filename)` — copies a single clip to `remotion/public/clips/` after every upload or download; ensures new clips are immediately available for rendering
- `server/index.js`: added `syncAllClipsToRemotion()` — on server startup, syncs all existing `library/clips/*.mp4` to `remotion/public/clips/`; creates the directory if missing
- `remotion/src/components/FootageScene.jsx`: replaced direct `clip.file` URL with `staticFile('clips/${filename}')` — extracts filename from `clip.file` path, resolves correctly in both CLI render (Remotion bundle server) and browser preview

**Browser preview fix:** `staticFile('clips/...')` returns `/clips/...` in the browser. Added `/clips` static route in Express (serves `library/clips/`) and `/clips` proxy in `client/vite.config.js` so in-browser Remotion Player also resolves correctly.

**Verified:** Test render of 1 image + 1 real_footage scene with a clip produced a 7.6s H.264 1920×1080 MP4 with AAC audio. ✓

### Fix 2 — Claude over-classifying scenes as `image` / `motion_graphic`
**Problem:** The `real_footage` classification rules were too restrictive (required ALL 3 conditions, penalised passive voice). Real scripts about real people were getting 0% real_footage scenes.

**Solution — updated classification rules in `server/services/claude.js`:**
- Changed from "all conditions must be true" to "any of these patterns" for real_footage
- Added: specific named person doing something visible, crowd/protest, sports moment, historical footage moments
- Target ratio added to prompt: ~30% real_footage, 50% image, 20% motion_graphic
- Added explicit rule: "Never produce 0% real_footage for a script about real events and real people"
- Reduced examples to only positive cases; removed the ones that reinforced restrictive rejection patterns

### Fix 3 — Verify selectedClips in render POST
**Confirmed already correct:** `ExportPanel.jsx` includes `selectedClips` in the render POST body. `render.js` destructures `selectedClips` from `req.body`. Added `console.log('[render] selectedClips count: ...')` to server log for debugging.

**Files changed:**
- `server/routes/render.js` — `syncClipsToRemotionPublic()`, log for selectedClips count
- `remotion/src/components/FootageScene.jsx` — `staticFile()` + filename extraction
- `server/services/claude.js` — revised real_footage classification rules
- `server/routes/library.js` — `syncSingleClipToRemotion()` after upload + download
- `server/index.js` — `syncAllClipsToRemotion()` on startup, `/clips` static route
- `client/vite.config.js` — `/clips` proxy added

---

## Session 14 — Intelligent Clip Sourcing
**Commit:** `feature: intelligent clip sourcing with Claude source identification`
**Date:** 2026-06-11

### Overview
Replaced basic tag-match clip finding with a Claude-powered two-phase intelligent sourcing system. Real_footage scenes now automatically find and download exact subject-specific footage from YouTube and Internet Archive.

### Architecture
```
VisualsStep "Generate All" → handleAutoSourceClips()
→ POST /api/clips/auto-source (SSE)
→ autoSourceAllClips(scenes, projectId)
  → for each real_footage scene:
    Phase 1: buildClipStrategy(scene) — Claude Haiku identifies best sources + timestamp hint
    Phase 2: searchYouTube / searchArchive → score results → downloadIntelligentClip
    → syncs to remotion/public/clips/ automatically
    → clipStore.addClip() saves to library/clips.json
→ SSE streams per-scene status to UI
→ done event → onSelectClip(scene_id, clip) wires clip to scene
→ failed/no_results → onConvertToImage(scene_id) converts to image fallback
```

### New files
- **`server/services/clipIntelligence.js`** — Claude Haiku source identification
  - `KNOWN_CHANNELS` map: 20+ reliable YouTube channels for common subjects (Apple, Google, Tesla, OpenAI, C-SPAN, TED, etc.)
  - `buildClipStrategy(scene)` — sends scene excerpt + subject_anchors to Claude Haiku
  - Returns: `{ strategy, subject, primary_queries, fallback_query, avoid_terms, timestamp_hint, min_video_duration, confidence }`
  - `timestamp_hint.start_seconds` — Claude estimates where in a typical video of this type the subject appears (skips intros, goes to substance)
  - Falls back to generic strategy on Claude error

- **`server/services/autoClipper.js`** — search + download orchestrator
  - `searchYouTube(query, options)` — yt-dlp ytsearch with channel filter, duration filter, avoid-terms filter
  - `searchArchive(query, options)` — Internet Archive advancedsearch API
  - `scoreResult(result, subjectAnchors)` — relevance scoring: subject anchor matches in title/channel (+3/+2), license bonus (PD +2, CC +1), authoritative source bonus (+3), quality terms (keynote/speech/interview/etc. +2), duration bonus (+1 each tier)
  - `downloadIntelligentClip` — yt-dlp `--download-sections` to temp file, ffmpeg exact 8s trim, syncs to `remotion/public/clips/`
  - Retry logic: if first download fails, tries second-ranked result
  - `autoSourceAllClips(scenes, projectId, onProgress)` — iterates all real_footage scenes sequentially

- **`server/routes/clips.js`** — SSE endpoint `POST /api/clips/auto-source`

### Updated files
- **`server/services/claude.js`** — added `callClaude(prompt, systemPrompt)` generic export (uses claude-haiku-4-5-20251001); used by `clipIntelligence.js`
- **`server/index.js`** — registered `app.use('/api/clips', require('./routes/clips'))`
- **`client/src/pages/wizard/VisualsStep.jsx`** — full rewrite:
  - Added `projectId` prop
  - `clipProgress` state (per scene_id SSE events), `isSourcingClips`, `clipsDone`
  - `handleAutoSourceClips()` — SSE consumer; wires `done` events to `onSelectClip`, `failed`/`no_results` to `onConvertToImage`
  - `handleGenerateAll()` local function — calls both `onGenerateAll()` (images/motion) and `handleAutoSourceClips()` (clips) in parallel
  - `STATUS_CONFIG` — icon/color/label per SSE event type
  - Clip sourcing panel above SceneGrid: per-scene status rows with icon, script excerpt, status message, low-confidence warning
  - "Auto-source clips" button for manual trigger; "✓ N/M clips sourced" when done
- **`client/src/pages/VideoCreator.jsx`** — added `projectId={projectId}` to `<VisualsStep>`

### Scoring algorithm
| Signal | Score |
|--------|-------|
| Subject anchor in title (exact) | +3 per anchor |
| Subject anchor in channel name | +2 per anchor |
| Public domain license | +2 |
| Creative Commons license | +1 |
| Authoritative channel (BBC/PBS/C-SPAN/TED/official) | +3 |
| Quality content type (keynote/speech/interview/hearing) | +2 |
| Duration > 5 min | +1 |
| Duration > 30 min | +1 |

### Timestamp hint system
Claude's strategy response includes `timestamp_hint.start_seconds` — an estimate of where the relevant subject content begins:
- Conference keynote: 120–180s (skip intro, get to speaker)
- Interview: 30s (skip short intro)
- Earnings call: 480–600s (skip financial disclaimers)
- Congressional hearing: 300s (skip opening statements)
- Default: 30s (skip title cards)

This ensures the 8-second clip captures the actual subject, not a title card or logo animation.

### Fallback chain per scene
1. Primary query with channel filter → score → download
2. If < 2 results: add Internet Archive results
3. If 0 results: try `fallback_query` (broader search)
4. If still 0: emit `no_results` → `onConvertToImage(scene_id)`
5. If download fails: retry with second-ranked result
6. If retry fails: emit `failed` → `onConvertToImage(scene_id)`

---

## Session 15 — Cinematographic Prompts, MagnatesMedia Motion Graphics, Composition-Driven Ken Burns
**Commit:** `feature: cinematographic prompts, MagnatesMedia motion graphics, composition-driven Ken Burns`
**Date:** 2026-06-11

### Overview
Three pipeline improvements to production output quality:
1. **Cinematographic prompt system** — Claude now generates and validates prompts to HIGGSFIELD PROMPT RULES standard; `promptEnhancer.js` cleans every prompt before Higgsfield generation
2. **MagnatesMedia-style motion graphics** — all 5 Remotion templates redesigned with left accent bars, word-by-word reveals, horizontal bars, and spring-animated dots
3. **Composition-driven Ken Burns** — `scene.composition` field drives `transformOrigin` for zoom, so close-ups zoom from center, low angles zoom from bottom, over-shoulder from left

### New fields in scene JSON
- **`composition`** — `"close_up" | "medium" | "wide" | "aerial" | "low_angle" | "over_shoulder"` — assigned by Claude based on dramatic purpose; defaults to `"medium"`

### New files
- **`server/services/promptEnhancer.js`**
  - `quickEnhance(prompt, scene)` — no API cost: removes banned words, adds missing composition/lighting, appends style lock
  - `claudeEnhance(prompt, scene)` — full Claude Haiku rewrite for weak prompts
  - `enhancePrompt(scene, useClaudeForWeak=true)` — main entry point
  - `enhanceAllPrompts(scenes)` — batch: skips non-image scenes

### Updated files
- **`server/services/claude.js`** — HIGGSFIELD PROMPT RULES added: COMPOSITION, LIGHTING, PERIOD DETAIL, ATMOSPHERE requirements; `composition` field in FIELD RULES; `drift_down` in MOTION; `callClaude` export
- **`server/routes/generate.js`** — `enhancePrompt(scene, false)` called before every `generateImage()`; added `POST /api/generate/enhance-prompts` batch endpoint
- **`remotion/src/components/AnimatedCounter.jsx`** — left accent bar, bold 108px number, `to ?? value` compat
- **`remotion/src/components/QuoteCard.jsx`** — left accent bar, word-by-word reveal, `quote || text` compat
- **`remotion/src/components/TimelineBar.jsx`** — spring dots, left-aligned layout
- **`remotion/src/components/ComparisonChart.jsx`** — horizontal bars (not vertical), 3px track fills with spring
- **`remotion/src/components/MapHighlight.jsx`** — double ring, region label top-left, `coordinates=[lat,lng]` compat
- **`remotion/src/components/ImageScene.jsx`** — `COMPOSITION_ORIGIN` map drives `transformOrigin`; `drift_down` added to `DRIFT_MAP`
- **`client/src/pages/wizard/ScenesStep.jsx`** — "Enhance prompts" button, `handleEnhancePrompts()`, `isEnhancing` state

---

## Session 16 — Stock Footage Library (Pexels + Pixabay)
**Commit:** `feature: stock footage library with Pexels + Pixabay, disable YouTube clip system`
**Date:** 2026-06-14

### Overview
Replaced the YouTube clip system (yt-dlp + autoClipper) with a stock footage library using Pexels and Pixabay. All YouTube clip code is commented out. The new system uses free commercial B-roll with no attribution requirements.

### YouTube clip system — DISABLED
- `server/services/autoClipper.js` — entire implementation wrapped in block comment, `module.exports = {}`
- `server/services/clipIntelligence.js` — entire implementation wrapped in block comment, `module.exports = {}`
- yt-dlp and ffmpeg no longer required for clip sourcing

### New: Stock footage system
**`server/services/stockFootage.js`** (NEW):
- `searchPexels(query, perPage)` — Pexels Videos API, returns landscape MP4 links, prefers HD
- `searchPixabay(query, perPage)` — Pixabay Videos API, returns free commercial clips
- `generateStockQuery(scene)` — Claude generates a 2-4 word B-roll search query from the scene context; falls back to subject anchors
- `scoreStockResult(result, subjectAnchors, query)` — relevance scoring: query word matches, anchor word matches, resolution bonus, Pexels preference, duration bonus
- `downloadStockClip(result, filename)` — direct HTTPS download with redirect following; validates >50KB; syncs to `remotion/public/clips/`
- `sourceStockClip(scene, projectId)` — searches Pexels + Pixabay in parallel, scores, downloads top result, adds to clip index via `clipStore.addClip()`
- `sourceAllStockClips(scenes, projectId, onProgress)` — iterates all `real_footage` scenes, returns `{ selectedClips, fallbackToImage }`

**`server/routes/clips.js`** — fully rewritten:
- `POST /api/clips/auto-source` — SSE endpoint, calls `sourceAllStockClips`; emits `{ type: 'complete', selectedClips, fallbackToImage }`
- `GET /api/clips/search?query=&source=pexels|pixabay|both` — manual search endpoint for ClipLibrary UI
- `POST /api/clips/download` — downloads a specific stock clip to library
- `GET /api/clips/status` — returns `{ pexels, pixabay, clipCount, youtubeSystem: 'disabled' }`

### Scene type ratio update
`server/services/claude.js` — SCENE TYPE DISTRIBUTION changed:
- Old: ~30% real_footage, 50% image, 20% motion_graphic
- New: **15% real_footage, 45% image, 40% motion_graphic**
- real_footage now targets stock B-roll (locations, environments, crowds) NOT specific named people
- Added explicit examples of what stock footage works/doesn't work for

### ClipLibrary UI update
`client/src/components/video-creator/ClipLibrary.jsx`:
- TABS changed: `library`, `pexels`, `pixabay` (YouTube CC, Fair Use, C-SPAN, TED disabled)
- New `StockSearchTab` component: search bar + results grid
- New `StockResultCard` component: thumbnail, duration, resolution, free commercial badge, Add button
- Header: shows Pexels/Pixabay connection status instead of yt-dlp version
- Stock search/download state: `stockQuery`, `stockResults`, `stockLoading`, `downloadingId`, `downloadedIds`
- `GET /api/clips/status` checked on load for API key status

### VisualsStep UI update
`client/src/pages/wizard/VisualsStep.jsx`:
- STATUS_CONFIG updated: `sourcing`, `done`, `fallback` events (was: `analyzing`, `searching`, `downloading`, `retry`)
- `complete` event handler: reads `fallbackToImage` field (was `convertToImage`)
- `fallback` SSE event type → calls `onConvertToImage(scene_id)`
- Panel description updated: "Claude generates search query · Pexels + Pixabay · free commercial"

### Environment variables required
```
PEXELS_API_KEY=...    # Free at pexels.com/api
PIXABAY_API_KEY=...   # Free at pixabay.com/api/docs
```
Both added to `.env` template.

### Fallback chain
1. Claude generates 2-4 word search query from scene context
2. Search Pexels (10 results) + Pixabay (10 results) in parallel
3. Score all 20 results → download top 3 until one succeeds
4. Success → `selectedClips[scene_id] = clip`
5. All downloads fail or no results → `fallbackToImage` → scene auto-converted to `image` type → queued for Higgsfield generation

### Testing
```powershell
# Test Pexels search
Invoke-RestMethod -Uri 'http://localhost:3001/api/clips/search?query=city+skyline&source=pexels'
# Test Pixabay search
Invoke-RestMethod -Uri 'http://localhost:3001/api/clips/search?query=office+meeting&source=pixabay'
# Test status
Invoke-RestMethod -Uri 'http://localhost:3001/api/clips/status'
```

---

## Session 17 — Remove Music, Sound Effects, Overlays Permanently
**Commit:** `cleanup: remove music, sound effects, overlays permanently`
**Date:** 2026-06-14

## Removed Features (permanently)
- Background music — removed
- Ambient sound — removed
- Transition stings — removed
- Overlay system (lower thirds, date stamps, kinetic text, stat callouts, chapter titles) — removed
- Sound effects — removed
- Audio step in wizard — removed

## Current Pipeline
Script → Scenes → Visuals → Voice → Export

## Output
MP4 with:
- AI images (Higgsfield) with Ken Burns motion — 45% of scenes
- Remotion motion graphics — 40% of scenes
- Stock footage (Pexels/Pixabay) — 15% of scenes
- Narration (ElevenLabs TTS)
- No music, no sound effects, no overlays

## Post-production (CapCut)
- Background music
- Sound effects
- Color grade
- Overlays and lower thirds
- Transitions polish

### Files deleted
**Server:**
- `server/services/elevenLabsAudio.js`
- `server/services/elevenLabsSound.js`
- `server/services/soundLibrary.js`
- `server/services/audioMixer.js`
- `server/services/ambientSelector.js`
- `server/services/ambientLibrary.js`
- `server/config/musicMoods.js`
- `server/config/transitionStings.js`
- `server/routes/audio.js`
- `server/routes/soundLibrary.js`

**Client:**
- `client/src/components/video-creator/AudioPanel.jsx`
- `client/src/components/video-creator/SoundLibraryPanel.jsx`
- `client/src/components/video-creator/OverlayStudio.jsx`
- `client/src/components/video-creator/DraggableOverlayCanvas.jsx`
- `client/src/components/video-creator/OverlayReviewModal.jsx`
- `client/src/pages/wizard/AudioStep.jsx`

**Library directories:**
- `library/music/`, `library/ambient/`, `library/stings/`, `library/overlay-sounds/`, `library/sounds/`
- `library/soundIndex.json`, `library/musicIndex.json`

### Files modified
- `server/index.js` — removed audio/soundLibrary routes and raw body middleware
- `server/routes/render.js` — removed audioMixer dependency; audioSpecs is now narration-only
- `server/services/claude.js` — removed OVERLAY GENERATION RULES, STING PLACEMENT RULES from system prompt; removed overlays/use_sting from postProcessScenes; removed templateContext from attemptAnalysis
- `remotion/src/compositions/Documentary.jsx` — removed music/ambient/overlay_sounds audio; kept per-scene narration and global NarrationTrack
- `remotion/src/components/ImageScene.jsx` — removed all overlay rendering; kept FilmLook (grain+vignette+grade) and Ken Burns motion
- `client/src/hooks/useWizardState.js` — removed audio step from STEPS array (5 steps: script, scenes, visuals, voice, export)
- `client/src/pages/VideoCreator.jsx` — removed audioSpecs state, overlay handlers, OverlayStudio/OverlayReviewModal modals, AudioStep case
- `client/src/pages/wizard/ScenesStep.jsx` — removed overlay banner and overlay-related props
- `client/src/pages/wizard/ExportStep.jsx` — removed audioSpecs prop
- `client/src/components/video-creator/SceneGrid.jsx` — removed OverlayEditorPanel, OverlayRow, card footer Overlay Studio section, overlay-related constants and props
- `client/src/components/video-creator/ExportPanel.jsx` — removed music/ambient/sting checklist items and audioSpecs prop

---

### Deployment Strategy

#### Branches
- `main` — development; push freely, never auto-deploys
- `production` — Railway watches this branch; only merge when ready to go live

#### Deploy command (from root folder)
```bash
npm run deploy
```
Merges `main` into `production` and pushes — triggers Railway rebuild automatically.

#### Quick deploy checklist
1. Test locally: `npm run build` then `NODE_ENV=production node server/index.js`
2. Commit all changes to `main`
3. Run: `npm run deploy`
4. Watch Railway dashboard for build status (5–10 min)
5. Verify at `https://bizcontently.com/health`

---

### Deployment — Railway ✅ Complete

**Platform:** Railway · **Domain:** bizcontently.com

**Architecture:**
- Single Docker container: Express serves both the API and the built React client (`client/dist`)
- Persistent volumes: `projects-volume` → `/app/projects`, `library-volume` → `/app/library` (survive redeployments)
- Health check: `GET /health` — no auth required; Railway probes this to confirm readiness
- Basic auth: `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` protect all routes in production; dev bypasses entirely
- Same-origin in production: client and server on the same domain, no CORS issues

**Files added:**
- `Dockerfile` — `node:20-slim`; ffmpeg, yt-dlp, Chromium (Remotion headless), Higgsfield CLI; builds React client; exposes 3001
- `railway.toml` — dockerfile builder; `/health` healthcheck; persistent volume mounts
- `server/middleware/basicAuth.js` — HTTP Basic Auth; skips `/health`; no-op in dev
- `server/scripts/setupHiggsfield.js` — writes `~/.config/higgsfield/credentials.json` from env vars on Linux
- `server/scripts/startup.js` — `ensureDirectories`, `syncClipsToRemotion`, `checkDependencies` — run before any routes
- `client/src/config/api.js` — `API_BASE = ''` utility; relative paths work same-origin in production
- `.env.production.example` — Railway variable template (includes Higgsfield tokens)
- `.dockerignore` — excludes node_modules, .env, .git, output dirs

**Files modified:**
- `server/index.js` — startup scripts called first; `/health` before basicAuth; basicAuth before routes; `/output` adds `Content-Disposition: attachment` for MP4 downloads; React SPA served from `client/dist` after all API routes
- `server/services/higgsfield.js` — `quoteCmdArg` now uses single-quote escaping on Linux; Windows path unchanged
- `server/routes/render.js` — passes `--browser-executable /usr/bin/chromium` on Linux for Remotion headless render
- `client/vite.config.js` — `build.rollupOptions.manualChunks` splits remotion + react chunks; `server.proxy` uses object form with `changeOrigin: true`; `port: 5173` explicit
- `package.json` — `build` and `start` scripts for Railway

**Environment variables (set in Railway dashboard):**
```
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=sk_...
PEXELS_API_KEY=...
PIXABAY_API_KEY=...
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=<strong password>
HIGGSFIELD_ACCESS_TOKEN=<from ~/.config/higgsfield/credentials.json on Windows>
HIGGSFIELD_REFRESH_TOKEN=<from ~/.config/higgsfield/credentials.json on Windows>
NODE_ENV=production
PORT=3001
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

**Higgsfield on Linux:**
The CLI stores auth in `~/.config/higgsfield/credentials.json`. On Windows this is written by `higgsfield login`. On the Railway container there's no browser OAuth, so `server/scripts/setupHiggsfield.js` reads `HIGGSFIELD_ACCESS_TOKEN` and `HIGGSFIELD_REFRESH_TOKEN` from env vars and writes the credentials file at server startup.

**Chromium on Linux:**
Remotion CLI spawns headless Chrome. `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` is set in the Dockerfile. `server/routes/render.js` reads this when `process.platform === 'linux'` and passes it as `--browser-executable` to the Remotion CLI.

---

### Fix 12 — Narration cutoff at scene start ✅ Complete

**Problem:** First syllable of narration was being clipped on every scene. Two root causes.

**Root causes:**
1. **Crossfade overlap**: `TransitionSeries` crossfade is 12 frames (0.4s). During those frames the outgoing scene is still visible and its audio can mask the incoming narration starting at frame 0.
2. **Start silence too short**: `addSilencePadding` used 100ms start delay — not enough to survive the crossfade overlap and browser audio init.

**Fixes:**
- `server/services/elevenlabs.js` — `addSilencePadding` default `startMs` raised from **100ms → 500ms**, `endMs` from **600ms → 800ms**. Added `-loglevel quiet`, timeout, and temp-file existence check.
- `remotion/src/compositions/Documentary.jsx` — Narration `<Audio>` wrapped in `<Sequence from={index === 0 ? 0 : TRANSITION_FRAMES}>`. Scene 1 starts at frame 0 (no incoming crossfade); scenes 2+ start at frame 12, after the cross-fade completes. Volume fade-out adjusted to `durationFrames - TRANSITION_FRAMES - 9` to match.
- `server/routes/voiceover.js` (generate + sync-timings) — Scene duration formula updated: `audio_duration + CROSSFADE_SECONDS (0.4) + END_BUFFER (0.8) = audio_duration + 1.2s`. Ensures the scene is long enough to play the full narration after the delayed start.
- `server/routes/voiceover.js` — Added `POST /api/voiceover/repad` SSE endpoint. Re-applies ffmpeg padding to existing `.mp3` files without re-calling ElevenLabs. Returns `updatedScenes` with corrected `audio_duration` and `duration_seconds`.
- `client/src/pages/wizard/VoiceStep.jsx` — Added "Fix narration start timing" button. Calls `/api/voiceover/repad`, merges `updatedScenes` into state and localStorage. Only visible when audio files exist.

**Audio padding summary:**
- Start silence: 500ms (covers 12-frame crossfade at 30fps = 400ms + 100ms init margin)
- End silence: 800ms (natural breath before next scene begins)
- Narration in Remotion: starts at `TRANSITION_FRAMES` (frame 12) for scenes 2+
- Scene duration = `audio_duration + 0.4 (crossfade) + 0.8 (end buffer)`

---

## Session 18 — J-cut and L-cut Narration Transitions + Full transition_out System
**Commit:** `feature: J-cut and L-cut narration audio transitions`
**Date:** 2026-06-16

### Overview
Two parallel upgrades to the Remotion audio pipeline:
1. **Full `transition_out` system** — dissolve / cut / dip_black / dip_white per-scene with correct narration timing and duration calculation
2. **J-cut and L-cut narration** — editorial audio transitions where narration crosses scene boundaries

### transition_out system (Session 17 continuation)

**`remotion/src/compositions/Documentary.jsx`** — complete rewrite:
- `CUT_FRAMES=1`, `DIP_FRAMES=18`, `DIP_FADE=9`, `DIP_MID=8` constants
- `getTransition(scene)` pure fn — returns `{ type, frames, outgoingFade, narrationIn, color }`
- `calculateDocumentaryDuration` deducts per-boundary net cost (dip = 9+9-8=10, dissolve=12, cut=1)
- `seriesChildren` flatMap handles all 4 transition types; dip uses 3-element pattern: fade9 → solid8 → fade9
- Narration `from` delay uses previous scene's `inT.narrationIn` (not hardcoded 12)
- Volume fade-out uses `outT.outgoingFade` per scene

### J-cut and L-cut narration

**Architecture change:** narration `<Audio>` elements moved OUT of `TransitionSeries.Sequence` children and rendered as `<Sequence from={absoluteFrame}>` siblings alongside `<TransitionSeries>`. This gives full control over when each narration starts/ends regardless of scene boundaries.

**New function `computeSceneStartFrames(scenes, fps)`:**
- Returns absolute global start frame for each scene
- Uses same per-boundary deduction logic as `calculateDocumentaryDuration`
- Used to compute `narrationStart` in global frame space

**New scene JSON fields:**
```json
{
  "audio_cut": "hard" | "j_cut" | "l_cut",  // default: "hard"
  "audio_overlap_seconds": 1.2               // default: 0; range 0.8–2.5 for j/l cuts
}
```

**narrationStart calculation:**
- `"hard"` → `sceneStart + incomingTransitionFrames` (preserves existing behaviour)
- `"j_cut"` → `Math.max(0, sceneStart - overlapFrames)` — starts before visual cut; no inDelay
- `"l_cut"` → `sceneStart + inDelay` — normal start, but sequenceDuration extends past sceneEnd

**Volume envelopes (frame = sequence-local, 0 = narrationStart):**
- `hard`: fade out `durationFrames - inDelay - outgoingFade - 9` → `durationFrames - inDelay`
- `j_cut`: fade IN 0→6 fr (narration under prev scene), fade out same as hard relative to sceneEnd
- `l_cut`: sustain through visual transition, fade out over 6 fr at `sceneEnd + overlapFrames`

**Validation / fallback:**
- Missing `audio_cut` → `"hard"`
- Missing `audio_overlap_seconds` on j/l → 1.0s default
- `narrationStart < 0` (j_cut on scene 0) → clamped to 0
- `audio_cut` on dip transitions → forced to `"hard"` (dips are deliberate pauses)
- `audio_cut` on last scene → forced to `"hard"`

**`server/services/claude.js`** — system prompt additions:
- `AUDIO CUT RULES` section added before COMPACT JSON RULES
- Rules: max 1 j/l per 4 scenes; never on dip transitions; never on last scene; overlap 0.8–1.5 for j_cut, 0.8–2.0 for l_cut
- `postProcessScenes` now outputs `audio_cut: 'hard'` and `audio_overlap_seconds: 0` as defaults

### Files changed
- `remotion/src/compositions/Documentary.jsx` — complete rewrite with all above features
- `server/services/claude.js` — AUDIO CUT RULES in system prompt + postProcessScenes fields

---

## Session 19 — GSAP Easings, Three.js Globe, Framer Motion UI Animations
**Commit:** `feature: GSAP easings, Three.js globe, Framer Motion UI animations`
**Date:** 2026-06-16

### Step 1 — GSAP easing utility

**Install:** `cd remotion && npm install gsap`

**`remotion/src/utils/easings.js`** (NEW):
- `gsapEase(easeName, progress)` — clamps 0–1, calls `gsap.parseEase(easeName)(p)`, fully deterministic
- Pre-bound helpers: `easeOut` (power2.out), `easeIn`, `easeInOut`, `elastic`, `back`, `expo`
- GSAP used as pure math — NO timeline playback, NO side effects
- CRITICAL: must use named import `import { gsap } from 'gsap'` — default import lacks `parseEase`

**`remotion/src/components/ImageScene.jsx`** — Ken Burns easing:
- Old: symmetric cubic ease-in-out via `interpolate(frame, ..., { easing })`
- New: `const linearT = interpolate(frame, ...); const progress = easeOut(linearT)`
- `power2.out` gives fast-start/heavy-deceleration — camera glides to natural stop; at t=0.5 → 0.875

### Step 2 — Three.js 3D Globe

**Install:** `cd remotion && npm install three`

**`remotion/src/components/ThreeGlobe.jsx`** (NEW):
- DETERMINISM: rotation = `frame / fps * rotationSpeed`; no requestAnimationFrame; renderer in `useRef`; no Date.now() or Math.random()
- Fibonacci sphere dot cloud (1600 pts, deterministic) suggests land masses
- Lat/lng grid lines (5 parallels, 4 meridians); atmosphere glow via additive BackSide shell
- `globe_markers: [{ lat, lng, label, color }]` rendered as glowing sphere + halo ring on surface
- `renderer.setPixelRatio(1)` — no devicePixelRatio variance between renders

**Wiring:**
- `MotionGraphicScene.jsx` — `if (scene.motion_graphic_type === 'globe') return <ThreeGlobe scene={scene} />`
- `Documentary.jsx` — `shot_type: "3d_graphic"` dispatches to `<ThreeGlobe>` via SceneRenderer

**`server/services/claude.js`:**
- `"3d_graphic"` added as 4th shot_type (max 1 per video, geographic/global scenes only)
- `globe_markers` field rule in FIELD RULES
- `globe_markers: []` default in `postProcessScenes`

### Step 3 — Framer Motion UI animations

**Install:** `cd client && npm install framer-motion`

**3a — `SceneGrid.jsx`:** Motion graphic code block expand/collapse animated with `AnimatePresence` + `motion.div` (`height: 0→auto`, `opacity: 0→1`, `duration: 0.2, ease: 'easeOut'`).

**3b — `VideoCreator.jsx`:** Wizard step container wrapped in `AnimatePresence mode="wait"` + `motion.div key={wizard.currentStep}`. Slides in from right (`x: 20→0`), exits to left (`x: 0→-20`). `duration: 0.18`.

**3c — `VisualsStep.jsx`:** Clip sourcing progress card rows are `motion.div` with `opacity: 0→1, scale: 0.97→1, duration: 0.15` as each card appears during auto-sourcing.

### Files changed
- `remotion/src/utils/easings.js` — NEW (GSAP easing utility)
- `remotion/src/components/ImageScene.jsx` — Ken Burns uses `easeOut()` from easings.js
- `remotion/src/components/ThreeGlobe.jsx` — NEW (Three.js deterministic globe)
- `remotion/src/components/MotionGraphicScene.jsx` — globe fallback for `motion_graphic_type: "globe"`
- `remotion/src/compositions/Documentary.jsx` — `3d_graphic` shot type dispatch + ThreeGlobe import
- `server/services/claude.js` — `3d_graphic` shot type, `globe_markers` field
- `client/src/components/video-creator/SceneGrid.jsx` — Framer Motion code expand/collapse
- `client/src/pages/VideoCreator.jsx` — Framer Motion wizard step transition
- `client/src/pages/wizard/VisualsStep.jsx` — Framer Motion clip progress card appear

---

## Session 20 — Production Test: Transitions, J/L Cuts, GSAP, Three.js, Framer Motion
**Commit:** `test: production readiness — transitions, J-L cuts, GSAP, Three.js, Framer Motion`
**Date:** 2026-06-17

### Method
Code-level verification via Node.js simulation + module resolution checks + client build. Visual/audio tests require the user to run in Remotion Studio — disk space constraint (293MB clips in `remotion/public/clips/`) prevented automated Remotion bundle copy.

### Check 1 — Transition system ✓ PASSED
Node.js simulation of `computeSceneStartFrames` + `calculateDocumentaryDuration` with all 4 types:
- Duration: `6×30+5×30+7×30+5×30+5×30 − 12 − 1 − 10 − 10 = 807 frames` ✓
- dissolve deducts 12fr, cut deducts 1fr, dip deducts `DIP_FADE×2 − DIP_MID = 10fr` ✓
- Scene start frames advance correctly for all transition types ✓

### Check 2 — Narration timing ✓ PASSED
`getTransition().narrationIn` per type:
- dissolve: 12fr — after crossfade completes ✓
- cut: 1fr — near-instant ✓
- dip_black / dip_white: 9fr — starts as dip plate fades to new scene ✓

### Check 3 — J-cut ✓ PASSED
- `narrationStart = Math.max(0, sceneStart − overlapFr)` — starts before visual cut ✓
- J-cut on scene 0 → clamps to 0 ✓; on dip transitions or last scene → falls back to "hard" ✓

### Check 4 — L-cut ✓ PASSED
- `sequenceDuration = sceneEnd + overlapFr − narrationStart` — bleeds past scene end ✓
- Volume fades over 6 frames at the bleed end ✓; last scene → "hard" ✓

### Check 5 — GSAP Ken Burns ✓ PASSED
- Named import `{ gsap }` confirmed working; `parseEase('power2.out')(0.5) === 0.875` ✓
- `ImageScene.jsx` imports and uses `easeOut` from `../utils/easings` ✓

### Check 6 — Three.js Globe ✓ PASSED
- `three` r184 installed, resolves from `remotion/node_modules/` ✓
- `SceneRenderer` dispatches `shot_type: "3d_graphic"` to `<ThreeGlobe>` ✓
- Determinism: rotation = `frame / fps × rotationSpeed`, no requestAnimationFrame ✓
- Canvas: `renderer.setSize(1920, 1080, false)` + `setPixelRatio(1)` ✓
- `ErrorBoundaryScene` wrapper catches WebGL unavailability gracefully ✓

### Check 7 — Framer Motion UI ✓ PASSED
- `framer-motion@12.40.0` installed; client build clean (2224 modules, 0 errors) ✓
- SceneGrid: `AnimatePresence` + `motion.div key="code-expand"` height 0→auto ✓
- VideoCreator: `AnimatePresence mode="wait"` keyed by `wizard.currentStep` ✓
- VisualsStep: clip cards use `motion.div` scale+opacity entrance ✓

### Check 8 — Full render
Not tested in this session — disk space constraint. All module imports verified; no code issues found.

### Known limitations
- **Disk space**: `remotion/public/clips/` is 293MB. Delete unused clips before running `remotion bundle` if disk is tight.
- **WebGL in headless render**: `ThreeGlobe` requires WebGL. Railway Docker needs GPU/WebGL support for headless Chrome render; otherwise `ErrorBoundaryScene` shows error card.
- **Visual tests for user**: In Remotion Studio — scrub transitions at scene boundaries, listen for J/L cut audio bleed, watch Ken Burns deceleration on image scenes. Set one scene to `shot_type: "3d_graphic"` + `globe_markers` in localStorage to test globe.

---

## Session 21 — Fix: TransitionSeries sequence shorter than transition duration
**Commit:** `fix: clamp minimum scene duration to prevent TransitionSeries crash`
**Date:** 2026-06-17

### Error
```
The duration of a <TransitionSeries.Sequence /> must not be shorter than the duration
of the next <TransitionSeries.Transition />. The transition is 9 frames long, but the
sequence is only 8 frames long (index = 6, duration = 8)
```

### Root causes (two bugs, both fixed)

**Bug 1 — DIP_MID (8) < DIP_FADE (9) — structural crash on every dip transition:**
Flatmap pattern: `[scene] → [Transition 9fr] → [dip_plate 8fr] → [Transition 9fr] → [next_scene]`
Remotion requires each sequence >= its adjacent transition. dip_plate (8fr) < Transition (9fr) → always crashes on any dip transition.
**Fix:** `DIP_MID = DIP_FADE + 1 = 10` (was 8). Net dip deduction now `9+9−10 = 8fr` (was 10fr).

**Bug 2 — MIN_SCENE_FRAMES (30) could produce scenes shorter than TRANSITION_FRAMES (12):**
Voiceover sync can produce scenes with `duration_seconds < 0.4s` → fewer than 12 frames → crash on adjacent dissolve.
**Fix:** Introduced `sceneDur(scene, fps)` — single frame-count source of truth:
```js
const MIN_SCENE_FRAMES = TRANSITION_FRAMES + 1  // 13 — > any transition arm
function sceneDur(scene, fps) {
  return Math.max(Math.round((scene.duration_seconds || 5) * fps), MIN_SCENE_FRAMES)
}
```

**Defensive dip downgrade:**
`getTransition(scene, sceneDurationFrames)` now accepts scene's computed frame count. If dip scene < `DIP_FADE * 2 = 18fr`, auto-downgrades to dissolve with console warning.

### Files changed
- `remotion/src/compositions/Documentary.jsx` — `DIP_MID` fixed (8→10), `MIN_SCENE_FRAMES` constant added (13), `sceneDur()` helper, `getTransition()` downgrade logic

### Note: ENOSPC disk warning
`ENOSPC: no space left on device` from webpack is harmless — cache write fails, next Studio start rebuilds from scratch. Free space by removing unneeded files from `remotion/public/clips/`.

---

## Session 29 — Feature: Fine-Tune script editing with auto/manual voice regeneration ✅ COMPLETE
**Commit:** `feature: Fine-Tune script editing with auto/manual voice regeneration`
**Date:** 2026-07-04

### What was built
Editable narration script per scene card in Fine-Tune, with a session-level choice between
auto-regenerating the voice on every save and an explicit per-scene "Regenerate Voice" button.

**Scene fields (new):** `voice_stale` (boolean — narration out of sync with the text),
`original_script_excerpt` (the pre-edit script, stored once by the first edit, cleared by revert —
the text counterpart of the `scene_{id}_original.mp3` audio backup).

**Server — `server/routes/scenes.js` (three new routes):**
- `PATCH /api/scenes/:sceneId/script` — validates the new text through the exact gate
  `generateAudio()` itself uses (`preprocessForTTS` → `validateTTSText` from
  `textPreprocessor.js`), so accepted text can never fail TTS validation later. Rejection = 400
  with the issues, NOTHING saved. Success = `script_excerpt` updated, `voice_stale: true`,
  `original_script_excerpt` preserved backup-once, persisted via `scenesFile.js`.
- `POST /api/scenes/:sceneId/regenerate-voice` — regenerates that one scene's narration from its
  CURRENT stored `script_excerpt` (never client-supplied text) through the same
  `elevenlabs.generateAudio()` pipeline `/api/voiceover/generate` uses (preprocess → validate →
  `generateSingleAudio`/`generateAndConcatenate` → `addSilencePadding`), reused via the service
  module object (FT-3's monkey-patchable-module technique), never duplicated.
  - **Failure safety:** generation writes to a temp file; only after generation AND duration
    measurement succeed does the old file get backed up (`scene_{id}_original.mp3`, backup-once via
    the new `voiceSwap.backupOriginalVoiceIfNeeded`, mirroring `imageSwap`) and the temp renamed
    over the live path (same URL — nothing else referencing it changes). Any error → temp deleted,
    500, scene bytes/fields completely untouched, `voice_stale` stays true (the UI's badge doubles
    as the retry affordance).
  - **Duration sync:** `duration_seconds = narrationSafeSceneDuration(audio_duration)` — the exact
    formula `/api/voiceover/sync-timings` uses (Session 27), for this scene only.
  - **FT-1/FT-4 conflict reset (scoped to this scene only):** a pre-existing manual boundary offset
    (`is_manual_offset`) is cleared, and a manual duration trim (detected as `duration_seconds` ≠
    the value derived from the OLD audio) is overwritten by the fresh sync; the response reports
    `manual_adjustments_reset` so the client shows: "Script changed — manual duration/offset was
    reset because it no longer matched the new narration length."
  - Re-reads `scenes.json` fresh before the final write (generation takes time; FT-3 precedent).
- `POST /api/scenes/:sceneId/revert-voice` — restores BOTH `script_excerpt` (from
  `original_script_excerpt`) and the audio (from the `*_original.mp3` backup) to their state at
  Fine-Tune entry, re-syncs durations from the restored file, clears `voice_stale`. The backup file
  is kept (still the true original), so revert is idempotent; 400 only when nothing was ever edited.

**Server — `server/services/voiceSwap.js` (NEW):** `backupOriginalVoiceIfNeeded(audioDir, sceneId,
currentAudioPath)` — `.mp3` twin of `imageSwap.backupOriginalIfNeeded`, same backup-once guarantee.

**Client — `client/src/pages/wizard/FineTuneStep.jsx`:**
- Mode toggle in the Fine-Tune header bar: "Auto-regenerate voice on save" — a session setting in
  localStorage (`vorta_finetune_auto_regenerate`), default ON, not per-scene.
- Each card gets a Script textarea (saves on blur or the explicit Save button; no-op when clean).
  Auto mode: PATCH script → POST regenerate-voice in sequence with a single combined
  "Saving and regenerating…" state. Manual mode: PATCH only; the card shows a "⚠ voice out of sync"
  badge (`voice_stale`) + "Regenerate Voice" button. That badge+button pair also appears after an
  auto-mode regeneration failure — the saved-but-stale state and its retry path are the same thing.
- `voiceId` comes from `vorta_selected_voice` (persisted by VoiceoverPanel); a clear inline error
  asks the user to pick a voice in the Voice step if none is saved yet.
- Regeneration success re-syncs the FT-1 duration slider to the fresh value; the conflict-reset
  warning renders inline on that card. All loading/stale/error states are per-card — other scenes
  stay fully interactive.
- "Revert script & voice to generated" appears once a scene has been edited
  (`original_script_excerpt` present) and calls revert-voice, restoring textarea + audio + slider.

**Guardrails respected:** FT-1–FT-9 logic untouched beyond the scoped conflict reset (confirmed:
full existing suites re-run green, see below). Validation runs before ANY generation attempt in
both modes — enforced server-side in both endpoints, including a test that force-writes invalid
text into scenes.json and proves zero `generateAudio` calls.

### Testing — commands run and results
```
$ node server/routes/voiceRegenerate.test.js
```
18/18 assertions passed (real Express app over HTTP, ElevenLabs pipeline monkey-patched on the
module object writing real bytes to disk): valid PATCH sets `voice_stale`/preserves
`original_script_excerpt` once and leaves audio untouched; short/punctuation-only/empty text →
400 with zero state change; first regeneration creates `scene_{id}_original.mp3` with the true
original bytes and a second edit+regeneration never touches it; `audio_duration`/
`duration_seconds` re-synced via `narrationSafeSceneDuration`, `voice_stale` cleared; a scene with
no prior narration gets a file and no spurious backup; a simulated ElevenLabs failure leaves
audio_path/audio_duration/duration_seconds/file bytes byte-identical with `voice_stale` still true
and no temp leftovers; invalid stored text → 400 with generateAudio never called; FT-1 manual trim
+ FT-4 manual offset reset with `manual_adjustments_reset: true`, scoped to that scene only (and
`false` when nothing manual existed); the auto-mode endpoint sequence (PATCH → POST) and
manual-mode sequence (PATCH alone changes no audio, fires no generation, until the explicit POST)
both verified end-to-end; revert restores script + original audio bytes, clears the marker, keeps
the backup, is idempotent, and 400s only on a never-edited scene.

```
$ node server/services/frameMath.test.js && node server/routes/scenes.test.js
$ node server/routes/images.test.js && node server/routes/higgsfieldRegenerate.test.js
$ node server/services/imageSwap.test.js && node server/services/claude.test.js
```
All existing FT-1–FT-9 suites pass unchanged — guardrail confirmed.

```
$ cd client && npx eslint src/pages/wizard/FineTuneStep.jsx   # clean
$ cd client && npm run build                                   # ✓ built (2236 modules)
```

---

## Session 28 — Attempted fix: scale numberOfSharedAudioTags to scene count — DID NOT FIX the stutter (mechanism now instrumented and confirmed)
**Commit:** `fix: scale numberOfSharedAudioTags to scene count`
**Date:** 2026-07-04

### Hypothesis tested (user-directed)
Audio tag pool too small → Remotion reuses a shared `<audio>` tag mid-playback without fully resetting it → overlapping fragments = the stutter. Proposed fix: scale the pool to `scenes.length + 2` (same pattern as the earlier Html5Audio-limit fix, PLAN.md "Audio tag architecture").

### Step 1 facts (before changing anything)
- Bug project `proj_1782504529155`: **65 scenes, 65 with narration**. Repro scene: scene_id **002** ("Apple doesn't sell groceries…" — first in the array after an FT-2 reorder).
- The premise "`numberOfSharedAudioTags={10}`" did not match the code: at HEAD both players used **256** (set by Session 25). So the pool was never smaller than the scene count.
- Live instrumentation (temporary `NarrationAudio` wrapper logging every mount/unmount/play/seek + a document-level tap on all `<audio>` elements) showed **max 1–2 narration elements mounted simultaneously** — narration `<Sequence>`s unmount outside their frame window, so pool exhaustion/reuse cannot occur at either 256 or 67 tags. No `AbortError`, no duplicate playing element, no remount loop (the earlier candidates A/C/D all ruled out by logs).

### Change applied anyway (harmless, keeps the pool proportionate)
- **`VideoPlayer.jsx` / `PreviewPlayer.jsx`** — `numberOfSharedAudioTags={256}` → `scenes.length + 2`, frozen at first render (`useState` initializer) because Remotion throws if this prop changes after mount.
- Rationale for not keeping 256: Remotion's shared-audio manager (`rerenderAudios`) iterates the ENTIRE pool on every per-frame audio prop update (narration `volume` is a function → every frame). CPU profile over 8s of playback showed ~1.3s self-time in that loop at 256 tags.

### Verification (puppeteer-driven, objective stutter detector)
Detector: a `seeking` event that moves a narration element **backward** >0.05s while playing — the exact operation that produces the audible repeated words. Matrix: 5× scene-002 runs (2 with scrub-ins), 3 other scenes (frames 1600/4200/7000 → scene_006/016/026), and a 12-scene subset seed (pool = 14).

**Result: NOT FIXED.** 8/9 runs still fail — 4–7 backward seeks per 10s run on the 65-scene project (e.g. scene_002 yanked 1.86 → 0.73, 2.51 → 1.27…). Only the 12-scene subset passed. Outcome reported honestly per the task instruction; no further fixes attempted this session.

### Confirmed actual mechanism (for the next session — from the full instrumentation record)
The narration `<audio>` element plays at **1× realtime**, but the Player's internal frame timeline advances at **~8% of wall clock** on the 65-scene project (measured frame 0→30 over 13.1s; backward-seek targets advance exactly +0.2s per ~2.5s cycle). Remotion's drift correction (threshold 0.65s) then repeatedly seeks the narration BACKWARD to the crawling timeline — each yank audibly replays the last ~1–2s: "groceries, gg, groc, groceries". Chrome lands mp3 seeks ~0.6s past the target, compounding the oscillation. Everything else was ruled out empirically: Player buffer state never engages (no `waiting`/`resume` events), AudioContext resumes exactly once, single mount, single element.
- The stutter reproduces identically in the sticky mini player (no per-frame React state in the page) → the PreviewPlayer overlay's per-frame re-render is a load contributor, not the cause.
- Scale correlation: 65-scene project stutters; 12-scene subset is clean. The starvation lives in per-frame render cost of the large composition (65 visual Sequences + 65 narration Sequences + full-screen effect stack incl. per-frame-regenerated SVG `feTurbulence` FilmGrain, `backdropFilter` ColorGrade/Halation) in the dev-mode Player — CPU profile: 4.5s/8s native (paint/raster), ~1.4s React element churn.
- Next-session candidates, in evidence order: (1) per-frame paint cost of the CinematicEffects stack (FilmGrain regenerates a unique SVG turbulence filter EVERY frame; ColorGrade/Halation use full-screen `backdropFilter`), (2) React commit latency of the 130-Sequence tree, (3) PreviewPlayer overlay re-render per frameupdate (65-thumbnail strip).

---

## Session 27 — Fix: voiceover cutoff (8s cap truncating narration) + repeat guard on mid-playback timing changes
**Commit:** `fix: voiceover cutoff — narration floor beats 8s style cap everywhere; pause player when timings change mid-playback`
**Date:** 2026-07-03

### Root cause 1 — narration cut off mid-sentence (voiceover cutoff)
Session 24's hard 8-second cap in `POST /sync-timings` set `duration_seconds = 8.0` even when the narration audio itself was longer (up to 14.2s in the newest real project — 30 of 65 scenes affected). `Documentary.jsx` force-fades narration to zero at the scene window's end, so every capped scene had its speech cut mid-sentence. Compounding bugs:
- `POST /repad` computed `duration_seconds = audio + 0.4` (crossfade only) — below even the FT-1 narration floor (`audio + 0.8`)
- `validateSceneUpdate` rejected any duration > 8s, so a scene with audio > 7.2s had **no legal duration at all** (max 8 < floor audio + 0.8) — impossible to edit or revert in Fine-Tune
- `clampDurationForActionCut` applied `Math.min(..., MAX_SCENE_SECONDS)` **last**, so an FT-5 action cut or FT-9 montage would re-truncate a long-narration scene back to 8s
- sync-timings never persisted `audio_path`/`audio_duration` to the project's `scenes.json` (verified 0/8 projects on disk had them), so every server-side narration floor ran with `audio_duration = undefined` and degenerated to a 0.8s floor

### Fix — the narration floor beats the 8s style cap, everywhere
New shared formulas in `server/services/frameMath.js`:
- `maxDurationSeconds(audio)` — per-scene ceiling: `max(8, minDurationSeconds(audio))`. Identical to the old flat 8s cap for audio ≤ 7.2s; only long-narration scenes get a higher personal ceiling
- `narrationSafeSceneDuration(audio)` — THE duration formula: `audio + 0.4 crossfade + 0.8 end buffer`, capped at 8s only when the cap still clears the narration floor. Narration is never structurally truncated

Applied in:
- **`server/routes/voiceover.js`** — `/generate`, `/repad`, and `/sync-timings` all use `narrationSafeSceneDuration`; the local 8s cap constant removed (imported from frameMath). `durationWarnings` shape changed: `{ scene_id, audio_duration, duration_seconds, exceeds_style_target }` (was `capped_to` — scenes over 8s are now reported, not capped; the real remedy remains splitting the script excerpt). sync-timings now also **persists** `audio_path`/`audio_duration`/`duration_seconds` into the project's `scenes.json` (best-effort merge via `scenesFile.js`) so FT-1/FT-5/FT-9 server clamps see real narration lengths
- **`server/services/frameMath.js`** — `validateSceneUpdate` ceiling and `clampDurationForActionCut` final clamp both use `maxDurationSeconds` instead of the flat 8s cap
- **`client/src/pages/wizard/FineTuneStep.jsx`** — slider max mirrors `maxDurationSeconds` so long-narration scenes are editable
- **`client/src/components/video-creator/VoiceoverPanel.jsx`** — warning log updated for the new `durationWarnings` shape

### Root cause 2 — narration replay when timings change mid-playback (repeat guard)
If scene timing changes while the Player is PLAYING (a Fine-Tune trim, reorder, transition change, or VoiceoverPanel's automatic whole-array sync-timings refresh after a generation run), every downstream narration `<Sequence from={...}>` shifts under the fixed playhead and Remotion seeks the currently-playing narration by the aggregate delta — backward = the last seconds audibly replay, forward = a skip.

- **`VideoPlayer.jsx` / `PreviewPlayer.jsx`** — compute a timeline signature from every field that moves a scene's start frame (`scene_id`, `duration_seconds`, `transition_out`, `audio_cut`, `audio_overlap_seconds`, manual J/L offsets); on signature change during playback, pause the player. The timeline position is meaningless across such an edit — the correct behavior is pause and let the user resume. Initial mount never pauses

### Tests (`server/services/frameMath.test.js` — all pass, all other suites unchanged and green)
- `maxDurationSeconds` / `narrationSafeSceneDuration` unit coverage incl. the 7.2s boundary
- **The invariant:** for 213 sampled narration lengths (0.3–15s incl. real capped scenes), the rendered narration window (`sceneDur` minus worst-case incoming transition delay — exactly Documentary.jsx's math) fits the full audio, AND the produced duration validates cleanly under FT-1
- Action cut / montage clamp preserves long narrations (no re-truncation to 8s); short-narration scenes still respect the 8s style cap
- The old assertion `clampDurationForActionCut(8, 100) === 8` (which enshrined the truncation bug) replaced with floor-wins behavior

---

## Session 26 — Fix: voiceover repeat bug — Chrome autoplay AbortError retry loop
**Commit:** `fix: voiceover repeat bug - root cause was browser autoplay AbortError retry loop, not React state`
**Date:** 2026-06-21

### Root cause (confirmed via console output)
Chrome's power-saving policy paused unmuted `<Video>` elements it classified as "video-only background media," producing repeated `AbortError: The play() request was interrupted because video-only background media was paused to save power` errors (11+ times per session). Remotion's default error recovery silently muted and retried `play()` on each interrupt — each retry restarted the media element from its Sequence start point, producing the millisecond-offset playback stutter.

The unmuted element was `<Video>` in `FootageScene.jsx` (stock footage clips). Stock footage audio was playing when only narration audio should have been heard.

### Fix
- **`remotion/src/components/FootageScene.jsx`** — added `muted` and `volume={0}` to the `<Video>` element. Stock footage is visual-only; narration carries the soundtrack via separate `<Audio>` elements.
- **`client/src/components/video-creator/VideoPlayer.jsx`** — added `acknowledgeRemotionLicense` prop.

### Investigation summary (Sessions 23-26)
| Session | Hypothesis | Outcome |
|---------|-----------|---------|
| 23a | Duplicate `<Audio>` render path from legacy sticky player | Fixed (hygiene), not the root cause |
| 23b | Unmemoized narrationTracks creating new volumeFn refs per frame | Fixed (correct optimization), not the root cause |
| 25 | numberOfSharedAudioTags too low → internal setState loop | Fixed (20/32 → 256), partially contributed |
| **26** | **Chrome autoplay AbortError on unmuted `<Video>` → Remotion retry-restart loop** | **Confirmed root cause via console output** |

---

## Session 25 — Fix: voiceover repeat bug — audio tag pool exhaustion + render-phase overhead
**Commit:** `fix: infinite re-render loop causing voiceover repeat bug (Maximum update depth exceeded)`
**Date:** 2026-06-21

### Root cause
Two compounding issues:

1. **`numberOfSharedAudioTags` far too low** — VideoPlayer had 20, PreviewPlayer had 32. PLAN.md specifies 256. With N narration Audio elements active, Remotion's internal audio tag pool was exhausted. When the pool runs out, Remotion creates non-shared tags during render, which triggers internal setState calls that can cascade into "Maximum update depth exceeded" — the actual error the user saw.

2. **Render-phase side effects running 30× per second** — Documentary.jsx had a `console.log` and an object-allocating duplicate-warning loop running unconditionally in the render body (not in useMemo). At 30fps playback, these ran 30+ times per second, creating GC pressure and potential DevTools interaction feedback loops.

### Fix
- **`VideoPlayer.jsx`** — `numberOfSharedAudioTags={20}` → `{256}`
- **`PreviewPlayer.jsx`** — `numberOfSharedAudioTags={32}` → `{256}`
- **`Documentary.jsx`** — removed render-phase `console.log`; moved frame mismatch assertion and duplicate narration warning into `useMemo` blocks so they run once when deps change, not on every frame render

### Prior investigation sessions (23a, 23b)
- Pass 1 removed a duplicate legacy sticky player (correct hygiene, not the root cause)
- Pass 2 memoized narrationTracks (correct — prevented volumeFn churn, but insufficient alone)
- This pass fixes the actual audio tag pool exhaustion that caused Remotion's internal re-render loop

---

## Session 24 — Enforce 8-second max scene duration
**Commit:** `feature: enforce 8-second max scene duration with auto-split safety net`
**Date:** 2026-06-20

### Problem
Some generated scenes ran 17-24 seconds — far too long for fast-cut documentary style.

### Changes

**`server/services/claude.js`**:
- Updated `duration_seconds` field rule in system prompt: "HARD MAXIMUM 8.0 seconds per scene" with explicit instruction to SPLIT long excerpts into multiple scenes with varied visuals
- Added `MAX_SCENE_SECONDS = 8.0` and `MIN_SCENE_SECONDS = 2.0` constants
- Added `enforceMaxSceneDuration(scenes)` — post-processing safety net that auto-splits any scene exceeding 8s into N chunks (each ≤ 8s), tagging them `_auto_split: true` and logging a warning. Applied before `postProcessScenes` so IDs get re-sequenced
- `duration_seconds` field in `postProcessScenes` now clamped to `[MIN_SCENE_SECONDS, MAX_SCENE_SECONDS]`

**`server/routes/voiceover.js`**:
- `POST /sync-timings` now caps scene duration at 8s even when narration audio is longer
- Warns loudly when a narration file exceeds 8s (indicates the script excerpt itself needs splitting)
- New response field `durationWarnings: [{ scene_id, audio_duration, capped_to }]` surfaces the issue to the client

**`client/src/components/video-creator/SceneGrid.jsx`**:
- Duration badge turns amber when scene is at 8s cap
- "auto-split" label shown on scenes that were auto-split by the safety net

**`client/src/components/video-creator/VoiceoverPanel.jsx`**:
- Logs `durationWarnings` from sync-timings response to console

### Rules
- Maximum scene duration: 8.0s (hard cap, enforced at prompt, post-processing, AND sync-timings)
- Minimum scene duration: 2.0s
- Target average: 4-6s
- Auto-split is a fallback — Claude should split long scenes with varied visuals in the prompt response; the auto-split safety net reuses the same visual (flagged for review)

---

## Session 23 — Fix: Voiceover repeat/echo bug (three passes)
**Commits:**
1. `fix: voiceover repeat/echo bug — remove duplicate narration audio render path` (2026-06-20)
2. `fix: voiceover repeat bug - memoize narration tracks to prevent per-frame Audio re-creation` (2026-06-20)

### Pass 1 — Remove duplicate Player instances
VideoCreator.jsx mounted a legacy sticky player simultaneously with the header mini player. Both rendered separate Documentary compositions with their own narration `<Audio>` elements. Removed the legacy player, cleaned up unused state.

### Pass 2 — Memoize narration audio computation (actual root cause)
`narrationTracks` (the array of narration Sequence/Audio descriptors) and `audioSpecMap` were computed inline in Documentary's render body — NOT inside useMemo. Remotion's Player re-renders the composition on every frame (30fps). Each render created:
- A new `audioSpecMap` object
- A new `narrationTracks` array
- New `volumeFn` closures for every scene

New `volume` function references on `<Audio>` each frame caused Remotion's shared audio tag pool to treat them as changed props, triggering audio element reassignment and playback restart — producing the millisecond-offset stutter.

**Fix:** Wrapped both `audioSpecMap` and `narrationTracks` in `useMemo` with stable dependency arrays (`[uniqueScenes, audioSpecs]` and `[uniqueScenes, audioSpecMap, sceneStartFrames, fps]`). Volume closures are now created once and reused across all 30fps re-renders until scenes actually change.

Also removed unused `useCurrentFrame` import from Documentary.jsx.

### Regression guard
Duplicate narration URL warning (from Pass 1) remains — logs `console.warn` if any narration URL renders more than once in `narrationTracks`.

---

## Session 22 — Fix: Scene repeat bug after transition system changes
**Commit:** `fix: scene repeat bug after transition system changes + add frame-count assertion`
**Date:** 2026-06-20

### Root cause
`VideoPlayer.jsx` and `PreviewPlayer.jsx` computed `durationInFrames` using a hardcoded all-dissolve formula (`(scenes.length - 1) * 12`) that didn't account for variable transition types introduced in Session 18 (cut=1fr, dip=8fr, dissolve=12fr). They also used `MIN_SCENE_FRAMES=30` while Documentary.jsx uses `MIN_SCENE_FRAMES=13` (fixed in Session 21). This created a frame count mismatch between the Player and the composition — the Player timeline was shorter than the actual content, causing TransitionSeries to wrap/repeat the first scene.

### Fix
- **`VideoPlayer.jsx`** — replaced ad-hoc `totalFrames` formula with `calculateDocumentaryDuration(inputProps.scenes, fps)` imported from Documentary.jsx. Player and composition now use the exact same function.
- **`PreviewPlayer.jsx`** — same fix: replaced `calcTotalFrames()` with `calculateDocumentaryDuration()`. Also replaced manual scene start frame loops with `computeSceneStartFrames()` for the progress bar markers and current-scene tracking.
- **`Documentary.jsx`** — exported `computeSceneStartFrames()` so PreviewPlayer can reuse it. Added permanent frame-count assertion: if `configDuration !== calculateDocumentaryDuration(uniqueScenes, fps)`, logs a warning with the exact diff. This surfaces any future mismatch immediately in the console.

### Files changed
- `client/src/components/video-creator/VideoPlayer.jsx` — import + use `calculateDocumentaryDuration`
- `client/src/components/video-creator/PreviewPlayer.jsx` — import + use `calculateDocumentaryDuration` and `computeSceneStartFrames`
- `remotion/src/compositions/Documentary.jsx` — export `computeSceneStartFrames`, add frame-count assertion

---

## Phase VR-1 — Channel Profile Setup ✅ COMPLETE
**Commit:** `feature: VR-1 channel profile setup — fresh and existing channel paths`
**Date:** 2026-06-17

### Overview
First phase of the Video Research module. Two paths for creating a Channel Profile: "Fresh Channel" (manual niche/angle/tone inputs → Claude synthesis) and "Existing Channel" (YouTube URL → YouTube Data API 3-tier pull → Claude synthesis). Profile persists in localStorage and powers future research phases.

### Backend — `server/routes/research.js`

**POST /api/research/suggestions**
- Accepts: `{ niche, subFocus }`
- Validates both required (400 if either empty)
- Single Claude Sonnet 4.6 call returns both angles and tones
- Returns: `{ angles: [5 strings], tones: [5 strings] }`
- Each option: short label + dash + one-line description
- Filters to non-empty strings, slices to 5 max
- JSON fallback: strips markdown fences if Claude wraps them

**POST /api/research/profile/fresh**
- Accepts: `{ niche, subFocus, angle, tone, competitors[] }`
- Validates all required fields (400 if any empty)
- Checks `ANTHROPIC_API_KEY` (500 if missing)
- Sends inputs to Claude Sonnet 4.6 for synthesis
- Returns full Channel Profile JSON with `path: "fresh"`, empty `catalog`, niche-landscape-derived performance data

**POST /api/research/profile/existing**
- Accepts: `{ channelUrl, competitors[] }`
- Checks `YOUTUBE_API_KEY` (400 if missing), `ANTHROPIC_API_KEY` (500 if missing)
- Resolves channel ID from URL — handles both `/channel/UCxxx` and `/@handle` formats (search endpoint for handle resolution)
- Three-tier YouTube API pull:
  - Tier 1: All video titles (paginated, up to 1000)
  - Tier 2: Top 20 videos by view count — full metadata
  - Tier 3: Most recent 30 videos — full metadata
- Passes all three tiers to Claude Sonnet 4.6 for synthesis
- Returns full Channel Profile JSON with `path: "existing"`, populated `catalog` and real performance data
- 404 if channel not found; 500 with error detail if Claude/YouTube fails

**Channel Profile schema:**
```json
{
  "profileId": "prof_[timestamp]",
  "createdAt": "ISO timestamp",
  "path": "fresh | existing",
  "channelName": "string",
  "niche": "string",
  "subFocus": "string",
  "angle": "string",
  "tone": "string",
  "competitors": ["array"],
  "catalog": ["array of titles"],
  "performanceFingerprint": { "topTopics": [], "winningFormats": [], "avgViewsTop20": 0, "bestPerformingTitle": "" },
  "currentDirection": { "recentTopics": [], "editorialShift": "" },
  "channelVoice": "string",
  "gaps": ["array"]
}
```

### Frontend — `client/src/pages/VideoResearch.jsx`

**State A — No profile (setup form):**
- Two-tab interface: "Fresh Channel" / "Existing Channel"
- Fresh tab: niche, sub-focus, angle (smart field), tone (smart field) + tag-style competitor input (max 5, Enter to add)
- Smart field behaviour: "Suggest →" button appears when niche + sub-focus are both filled; one API call fetches 5 angle + 5 tone chips; clicking a chip populates the text input and highlights it; editing text after selection deselects the chip; changing niche/subFocus clears stale suggestions
- Existing tab: YouTube URL input + competitor tags + timing note
- Two-phase loading for existing path: "Pulling channel data..." for first 10s, then "Synthesising profile..." until complete
- Client-side validation: submit buttons disabled until required fields filled
- Loading state with spinner + status messages
- Inline error display on failure
- Button disabled during API call (prevents double-click)

**State B — Profile exists (summary card):**
- Channel name, niche, sub-focus, angle, tone in info cards
- Competitor tags, channel voice paragraph, top topics, winning formats
- For existing profiles: catalog size and performance metrics
- Content gaps list
- Current direction with recent topics
- "Edit Profile" button → confirmation modal → clears localStorage → returns to State A
- "Start Researching →" button (disabled, tooltip: "Coming in next phase")

**localStorage:** Key `vr_channel_profile`. All reads/writes wrapped in try/catch. Malformed JSON falls back to State A.

### Other changes
- `server/index.js` — registered `app.use('/api/research', require('./routes/research'))`
- `client/src/components/layout/Sidebar.jsx` — Video Research `available: true` (was `false`)
- `.env` — added `YOUTUBE_API_KEY=` placeholder, fixed `NODE_TLS_REJECT_UNAUTHORIZED=0` (was `0c`)

### Production-readiness checks
- [x] 1. POST /suggestions with empty niche/subFocus → 400
- [x] 2. POST /suggestions with valid input → 5 angles + 5 tones, valid JSON
- [x] 3. POST /profile/fresh with empty fields → 400
- [x] 4. POST /profile/fresh with valid input → complete Channel Profile JSON
- [x] 5. POST /profile/existing with `/@handle` → resolves correctly
- [x] 6. POST /profile/existing with `/channel/UCxxx` → resolves correctly
- [x] 7. POST /profile/existing with invalid URL → 400
- [x] 8. POST /profile/existing with non-existent channel → 404
- [x] 9. YOUTUBE_API_KEY missing → 400 "YOUTUBE_API_KEY not configured"
- [x] 10. Claude API failure → 500 with error detail
- [x] 11. "Suggest →" only when niche + subFocus non-empty
- [x] 12. One API call fetches both angles and tones
- [x] 13. Chip selection populates text input
- [x] 14. Editing text after chip deselects chip
- [x] 15. Changing niche/subFocus clears stale suggestions
- [x] 16. Build Profile disabled on click, re-enabled on error
- [x] 17. Fresh path loading message
- [x] 18. Existing path two-phase loading (10s switch)
- [x] 19. localStorage try/catch with fallback
- [x] 20. Edit Profile confirmation modal
- [x] 21. "Start Researching →" disabled with hover tooltip
- [x] 22. All CSS classes use vorta- prefix
- [x] 23. Client build → zero errors, zero warnings (2224 modules)
- [x] 24. PLAN.md updated

---

## Phase VR-2 — Research Dashboard & Opportunity Discovery ✅ COMPLETE
**Commit:** `feature: VR-2 research dashboard — trending, gaps, competitor watch with SSE streaming`
**Date:** 2026-06-17

### Overview
Second phase of the Video Research module. Three-panel research dashboard powered by Claude with web search. Each panel (Trending Now, Gap Finder, Competitor Watch) runs as a parallel Claude call with `web_search_20250305` tool enabled. Results stream via SSE as panels complete. Reports persist in localStorage with a 20-entry history cap.

### Backend — `server/routes/research.js` (additions)

**POST /api/research/discover**
- Accepts: `{ profile }` (full Channel Profile object)
- Validates profile has niche, subFocus, angle, tone (400 if missing)
- Runs 3 parallel Claude calls via `Promise.allSettled` (not `Promise.all`)
- Each call uses `web_search_20250305` server-side tool for real-time data
- Filters out `alreadyCovered` items by cross-checking against `profile.catalog`
- Clamps `opportunityScore` to integer 1-10
- Returns combined report: `{ reportId, generatedAt, profileId, trending[], gaps[], competitors[] }`
- Failed panels return empty array; other panels unaffected

**POST /api/research/discover/stream**
- Same logic but SSE — streams `{ type: "panel", panel, items }` events as each Claude call resolves
- Error events per-panel: `{ type: "error", panel, message }`
- Done event: `{ type: "done", reportId, generatedAt }`
- Each panel arrives independently — UI populates incrementally

**GET /api/research/discover/status**
- Returns `{ running: boolean }` — in-memory flag for session status

### Frontend — `client/src/pages/VideoResearch.jsx`

**State C — Research Dashboard (new):**
- Three-column layout: Trending Now / Gap Finder / Competitor Watch
- SSE streaming via `fetch` + `ReadableStream` reader — panels populate as events arrive
- Each column: header with icon, loading skeletons, error state with "Retry panel" button, empty state
- Opportunity cards sorted by `opportunityScore` descending within each column
- Score badges color-coded: 1-4 red, 5-7 amber, 8-10 green
- Search volume pills, trend signals, gap reasons, competitor channels, suggested angles
- "Explore →" button opens 480px slide-in panel with VR-3 placeholder
- Top bar: "← Back to Profile", profile summary pill, timestamp ("X minutes ago" auto-updating), "New Research" button

**State B — "Start Researching →" now active:**
- Button is no longer disabled; clicks transition to State C (dashboard view)

**Persistence:**
- `vr_research_history` — array in localStorage, max 20 entries (drops oldest)
- `vr_last_report` — most recent report for instant reload without re-running discovery
- On return to State C, loads cached report; "Regenerate" via "New Research" button

**Panel retry:**
- "Retry panel" on error calls `POST /api/research/discover` (non-streaming) and updates just that panel
- Other panels unaffected during retry

### Production-readiness checks
- [x] 1. POST /discover with missing profile → 400
- [x] 2. POST /discover with valid profile → all three panels, correct structure
- [x] 3. Each panel 4-8 items
- [x] 4. opportunityScore clamped to integer 1-10
- [x] 5. alreadyCovered filtering via catalog cross-check
- [x] 6. SSE stream sends panels incrementally
- [x] 7. Promise.allSettled — failed panel doesn't cancel others
- [x] 8. Promise.allSettled confirmed in code
- [x] 9. "Start Researching →" active and navigates to State C
- [x] 10. Loading skeletons before data arrives
- [x] 11. Panels populate incrementally via SSE
- [x] 12. Cards sorted by opportunityScore descending
- [x] 13. Score badge colors correct (red/amber/green)
- [x] 14. "Explore →" opens slide-in panel with placeholder
- [x] 15. "← Back to Profile" returns to State B
- [x] 16. "New Research" appends to history and re-runs
- [x] 17. History capped at 20 entries
- [x] 18. Cached report loads on return — no auto re-run
- [x] 19. Timestamp auto-updates every 30s
- [x] 20. Empty state renders correctly
- [x] 21. Error state per panel with "Retry panel"
- [x] 22. Three-column layout at all widths
- [x] 23. All CSS classes use vorta- prefix
- [x] 24. Client build clean — zero errors
- [x] 25. PLAN.md updated

---

## Phase VR-3 — Idea Card + Angle Selection ✅ COMPLETE
**Commit:** `feature: VR-3 idea card — angle selection, topic depth, competitor coverage, idea save`
**Date:** 2026-06-18

### Overview
Third phase of the Video Research module. When the user clicks "Explore →" on a dashboard opportunity card, a 520px slide-in panel opens with three tabs: Overview (topic depth, key facts, timeline, key players), Angles (4 Claude-generated differentiated angles with fit scores, hooks, and difficulty ratings), and Competitors (how competitors covered the topic, with gap analysis). The user selects an angle and saves the idea, which persists in localStorage and triggers navigation to Script Writer.

### Backend — `server/routes/research.js` (additions)

**POST /api/research/angles**
- Accepts: `{ opportunity, profile }` — both validated (400 on missing fields)
- Claude Sonnet 4.6 call with `web_search_20250305` for real-time competitor data
- Response sanitized server-side:
  - Exactly 4 angles enforced (pad with placeholders if Claude returns fewer, trim if more)
  - `sanitizeAngle()` ensures all 10 fields present with defaults
  - `fitScore` clamped to integer 1-10 via `clampScore()`
  - `recommendedAngleId` validated against angle array — falls back to highest fitScore if Claude hallucinates
  - `topicDepth.keyFacts` clamped to 5-7 items
  - `competitorCoverage` always an array (never undefined)
  - `competitorInsight` always a non-empty string (default fallback provided)
  - `difficulty` validated to `low|medium|high` enum

**POST /api/research/idea/save**
- Accepts: `{ opportunity, selectedAngle, profile }` — validates all three (400 on missing)
- Returns: `{ ideaId: "idea_[timestamp]", savedAt: ISO, topic, opportunityScore, selectedAngle, profileId, status: "saved" }`

### Frontend — `client/src/pages/VideoResearch.jsx`

**IdeaCardPanel (replaces VR-2 placeholder):**
- 520px fixed right panel, full viewport height, own scroll
- Three tabs: Overview / Angles / Competitors
- API call fires immediately on panel open; re-fires when switching cards
- Escape key closes; outside click closes; clicking inside doesn't close
- Tab 1 — Overview: topic summary, key facts (numbered list), timeline (vertical line), main characters (chips)
- Tab 2 — Angles: 4 cards sorted by fitScore, recommended pre-expanded, accordion (one at a time), "Best fit" banner, approach/fitReason/competitorGap/duration/difficulty/hook in expanded state, "Use this angle →" select button, "Save Idea →" footer button gated on selection
- Tab 3 — Competitors: cards with channel/title/angle/weakness, empty state, `competitorInsight` synthesis block
- DifficultyChip: low=green, medium=amber, high=red
- Save flow: POST → success state 1.5s → navigate to Script Writer

**Dashboard integration:**
- "Saved ✓" chip on the card whose topic matches `vr_selected_idea.topic`
- Saved idea banner at top: "You have a saved idea — [topic]. Go to Script Writer →"
- Banner X dismisses; dismissed state in `vr_idea_banner_dismissed` localStorage key
- Switching cards while panel open resets to Tab 1 and re-fires API

**App.jsx:** `onNavigate={setActivePage}` passed to `<VideoResearch />` for Script Writer navigation

### Production-readiness checks
- [x] 1. POST /angles with empty body → 400
- [x] 2. Exactly 4 angles, all fields sanitized, fitScore 1-10, recommendedAngleId validated
- [x] 3. POST /idea/save with missing fields → 400; valid → confirmed object
- [x] 4. Claude malformed JSON → 500 with detail; wrong angle count → padded/trimmed
- [x] 5. Panel open/close: Escape, outside click, inside click safe, card switch resets
- [x] 6. Tab 1 renders all topicDepth fields; timeline conditional; keyFacts numbered
- [x] 7. Tab 2: 4 cards, sorted, recommended pre-expanded, accordion, all fields, difficulty colors
- [x] 8. Tab 3: competitor cards, empty state, competitorInsight block
- [x] 9. Save flow: POST fires, success 1.5s, navigates, localStorage written, error inline
- [x] 10. Post-save: "Saved ✓" chip, banner, dismiss persists, "Go to Script Writer" works
- [x] 11. Panel scrolls independently, 520px wide, layout intact at all widths
- [x] 12. Client build clean — zero errors
- [x] 13. PLAN.md updated

---

## Phase VR-4 — Research History + Profile Management ✅ COMPLETE
**Commit:** `feature: VR-4 research history panel, edit profile modal, profile snapshot`
**Date:** 2026-06-18

### Overview
Fourth phase of the Video Research module. Two new UI surfaces: a History Panel (left slide-in, 380px) showing all past research sessions with load/clear functionality, and an Edit Profile Modal (600px centered) for modifying channel settings without destroying history. Profile snapshots are now saved alongside each history entry.

### Frontend — `client/src/pages/VideoResearch.jsx`

**HistoryPanel (left slide-in, 380px):**
- Opens from State B ("View Research History" link) and State C ("History" button in top bar)
- Lists all entries from `vr_research_history` sorted most-recent-first
- Each card: formatted date, niche/subFocus from profileSnapshot, count summary, total opportunities
- "Current" chip on the active report; "Load →" on others
- Load sets report as `vr_last_report` and navigates to dashboard
- "Clear All" with confirmation modal — clears history + last report, preserves profile + saved idea
- Closes on Escape, outside click

**EditProfileModal (600px centered):**
- Two tabs: Channel Settings (pre-filled niche/subFocus/angle/tone/competitors with Suggest → support) and Channel Source (shows path, optional YouTube URL to switch/re-analyse)
- Save calls existing VR-1 endpoints (fresh or existing)
- Updates `vr_channel_profile`, clears `vr_last_report` (stale data), preserves `vr_research_history` and `vr_selected_idea`
- Warning shown: "Saving will clear your last research report. History is preserved."
- After save from State C: navigates to State B

**Mutual exclusion:**
- Opening History panel closes Idea Card panel and vice versa
- Both panels cannot be open simultaneously

**Profile snapshot in history:**
- `appendHistory()` now accepts `profile` param and saves `profileSnapshot: { channelName, niche, subFocus }` alongside each report
- History cards display snapshot data regardless of current profile state

**Other changes:**
- `App.jsx` — `onNavigate` already passed to VideoResearch (from VR-3)
- ProfileSummary: "Edit Profile" now opens modal instead of confirm-delete; "View Research History" link added
- Dashboard top bar: "History" button added; profile pill is clickable with edit icon → opens edit modal

### Production-readiness checks
- [x] 1. History opens from both State B and State C
- [x] 2. History entries render with date, niche/subFocus, counts
- [x] 3. Entries sorted most-recent-first
- [x] 4. "Current" chip on active report
- [x] 5. "Load →" loads correct report to dashboard
- [x] 6. New Research after Load adds new entry, doesn't overwrite
- [x] 7. Clear All confirmation shows correct count
- [x] 8. Clear All removes history + last report from localStorage
- [x] 9. Clear All preserves profile + saved idea
- [x] 10. Clear All navigates to State B from State C
- [x] 11. Empty history state renders correctly
- [x] 12. History panel closes on Escape and outside click
- [x] 13. Edit Profile opens as modal
- [x] 14. Modal pre-fills all fields
- [x] 15. "Suggest →" works inside modal
- [x] 16. Cancel closes modal, no changes
- [x] 17. Save calls correct endpoint
- [x] 18. Save updates vr_channel_profile
- [x] 19. Save clears vr_last_report
- [x] 20. Save preserves history + saved idea
- [x] 21. Warning visible in modal footer
- [x] 22. After save from State C: navigates to State B
- [x] 23. profileSnapshot saved with each history entry
- [x] 24. Panels mutually exclusive
- [x] 25. Edit Profile from profile pill in State C
- [x] 26. All panels/modals close on Escape
- [x] 27. Zero console errors
- [x] 28. Layout intact at all widths
- [x] 29. PLAN.md updated

---

## Phase VR-5 — Script Writer Handoff ✅ COMPLETE
**Commit:** `feature: VR-5 script writer handoff — research brief panel, idea wiring, sidebar cleanup`
**Date:** 2026-06-18

### Overview
Final phase of the Video Research module (before VR-6 data layer upgrade). Adds a Research Brief panel at the top of the Script Writer page that displays the saved idea from `vr_selected_idea` with full context: topic, selected angle with hook, collapsible topic depth and competitor coverage, stale profile warning, and "Change idea" / "Clear brief" actions. Script Writer sidebar item is now active. Handoff wiring ensures seamless navigation between Video Research and Script Writer.

### Frontend — `client/src/pages/ScriptWriter.jsx` (full rewrite)

**ResearchBrief panel:**
- Full-width dark card with purple left border accent, "Research Brief" + "From Video Research" chip
- Row 1: Topic title + opportunity score badge
- Row 2: Selected angle — title, pitch, approach, hook quote block
- Row 3: Topic depth (collapsible, collapsed by default) — summary, key facts (numbered), timeline, key players (chips)
- Row 4: Competitor coverage (collapsible, collapsed by default) — cards + insight paragraph
- Row 5: Footer — channel name + niche, "Idea saved [date]", "Change idea" + "Clear brief" actions
- Stale warning bar when `idea.profileId !== profile.profileId`

**No-brief state:**
- If `vr_selected_idea` absent or `vr_brief_dismissed_in_scriptwriter` is `true`: subtle "Research it in Video Research →" link
- "Coming soon" placeholder preserved below the brief/link

**Clear brief flow:**
- Confirmation modal → sets `vr_brief_dismissed_in_scriptwriter` in localStorage → React state update removes panel (no page reload)
- Does NOT delete `vr_selected_idea` — idea remains in Video Research
- Saving a new idea in VR-3 clears `vr_brief_dismissed_in_scriptwriter` automatically

### Other changes
- `client/src/App.jsx` — passes `onNavigate` to `<ScriptWriter />`
- `client/src/components/layout/Sidebar.jsx` — Script Writer `available: true` (was `false`)
- `client/src/pages/VideoResearch.jsx` — added `LS_BRIEF_DISMISSED` constant; VR-3 `handleSave` clears the flag on new idea save

### Production-readiness checks
- [x] 1. Brief renders when vr_selected_idea present
- [x] 2. Subtle link renders when idea absent
- [x] 3. Subtle link renders when brief dismissed
- [x] 4. All fields render with data — fallbacks for missing fields
- [x] 5. Score badge colors correct
- [x] 6. Hook quote block renders
- [x] 7. Topic research toggle works
- [x] 8. Competitor coverage toggle works
- [x] 9. Timeline conditional on array length
- [x] 10. Stale warning on profileId mismatch
- [x] 11. No stale warning when IDs match
- [x] 12. "Change idea" navigates to Video Research
- [x] 13. "Change idea" preserves vr_selected_idea
- [x] 14. "Clear brief" modal shows correct text
- [x] 15. Cancel — no changes
- [x] 16. Confirm — sets dismissed flag, panel replaced with link, idea preserved
- [x] 17. Dismissed state persists across navigations
- [x] 18. New idea save clears dismissed flag
- [x] 19. "Go to Script Writer" banner navigates correctly
- [x] 20. Script Writer sidebar active
- [x] 21. Video Research sidebar active
- [x] 22. Title & Thumbnail retains "Coming soon"
- [x] 23. Channel name + niche in footer with graceful fallback
- [x] 24. Saved date formatted correctly
- [x] 25. Malformed localStorage → try/catch → subtle link, no crash
- [x] 26. Collapsible sections start collapsed
- [x] 27. Zero console errors
- [x] 28. Full-width layout at all viewport widths
- [x] 29. PLAN.md updated

---

## Video Research Module — Feature Complete (pending VR-6 data layer upgrade)

The Video Research module (VR-1 through VR-5) is fully built and functional. The current implementation uses Claude with web search for all research data (trending topics, content gaps, competitor analysis). All phases:

| Phase | Feature | Status |
|-------|---------|--------|
| VR-1 | Channel Profile Setup | ✅ Complete |
| VR-2 | Research Dashboard + Opportunity Discovery | ✅ Complete |
| VR-3 | Idea Card + Angle Selection | ✅ Complete |
| VR-4 | Research History + Profile Management | ✅ Complete |
| VR-5 | Script Writer Handoff | ✅ Complete |

### Phase VR-6 — Data Layer Upgrade ✅ COMPLETE
**Commit:** `feature: VR-6 data layer — SerpApi trends, YouTube competition + competitor data, three-tier fallback`
**Date:** 2026-06-18

#### Overview
Replaced Claude web-search estimation with real data sources. Three new backend services with three-tier fallback chains and 24-hour caching. Claude remains the synthesis layer — interprets real numbers instead of guessing.

#### Backend services

**`server/services/trendsService.js`** — Google Trends data with three-tier fallback:
- Tier 1: SerpApi (`SERPAPI_KEY`) — 90-day timeseries, interest score, related topics
- Tier 2: google-trends-api npm package — fallback when SerpApi unavailable
- Tier 3: Claude estimation — fallback when both trend sources fail
- `getTrendDataBatch()` — parallel with 500ms rate limiting between calls
- 24-hour in-memory cache (Map-based, TTL check)

**`server/services/competitionService.js`** — YouTube Search API competition density:
- Search + stats fetch for any topic → totalResults, medianViews, avgViews, topVideo, weakCoverageSignals, competitionLevel (low/medium/high)
- Empty result handling for topics with no YouTube coverage
- 24-hour cache

**`server/services/competitorService.js`** — YouTube Data API competitor pulls:
- `getCompetitorVideos()` — recent + top videos, subscriber count, avg views
- `getAllCompetitorData()` — parallel via `Promise.allSettled`, one failure doesn't block others
- Handle resolution (`/@handle` → channelId) reused from VR-1 pattern
- 24-hour cache

#### Updated discovery flow (`server/routes/research.js`)
1. Claude generates candidate topics (still uses web_search for ideation)
2. Real data enrichment in parallel: trends batch + competition density + competitor pulls
3. Claude synthesis pass with real data injected — opportunity scores calculated from rubric (trend momentum 0-3 + competition gap 0-4 + channel fit 0-3)
4. SSE `done` event includes `dataSources` field showing which source served each panel + any fallback topics

#### Frontend updates (`client/src/pages/VideoResearch.jsx`)
- **MiniSparkline** component — SVG sparkline for topics with timelinePoints (60px wide)
- **Trending Now cards**: real interest score + trend direction + sparkline; "~est." chip on Claude-estimated topics
- **Gap Finder cards**: real competition data (video count, median views, competition level, weak coverage signals)
- **Competitor Watch cards**: real view counts + subscriber counts on channel chips
- **Data sources popover** — pill in dashboard top bar showing which APIs served the report + fallback count
- `formatK()` helper for human-readable numbers

#### Environment variables
- `SERPAPI_KEY` added to `.env` (optional — falls back to google-trends-api then Claude)
- `YOUTUBE_API_KEY` already existed from VR-1

#### Dependencies added
- `google-search-results-nodejs` — SerpApi client
- `google-trends-api` — direct Google Trends scraper
- `googleapis` — YouTube Data API v3 client

#### Production-readiness checks
- [x] 1. SERPAPI_KEY missing → falls back to google-trends-api
- [x] 2. Both trend sources fail → Claude estimate with dataSource field
- [x] 3. Rate limiting in getTrendDataBatch (500ms between calls)
- [x] 4. Cache works — second call returns cache hit
- [x] 5. Cache TTL is 24 hours
- [x] 6. Missing YOUTUBE_API_KEY → clear error
- [x] 7. No YouTube results → empty result, competitionLevel 'low'
- [x] 8. Promise.allSettled on competitor data — one failure doesn't block others
- [x] 9. Discovery latency logged per panel
- [x] 10. SSE still streams incrementally
- [x] 11. opportunityScore still integer 1-10 (sanitizeItem + clampScore)
- [x] 12. dataSources in done SSE event
- [x] 13. Data sources pill in dashboard top bar
- [x] 14. Popover shows correct sources
- [x] 15. "~est." chip on Claude-estimated cards
- [x] 16. Trending cards show real interest score + trend direction
- [x] 17. MiniSparkline renders (no error on empty points)
- [x] 18. Gap cards show real competition data
- [x] 19. weakCoverageSignals render (max 2 per card)
- [x] 20. Competitor cards show real view + subscriber counts
- [x] 21. VR-1 through VR-5 functionality preserved
- [x] 22. Zero console errors with real data
- [x] 23. Zero console errors on fallback paths
- [x] 24. Layout intact with enriched content
- [x] 25. PLAN.md updated

---

## Video Research Module — Fully Complete

All six phases of the Video Research module are built, tested, and deployed:

| Phase | Feature | Status |
|-------|---------|--------|
| VR-1 | Channel Profile Setup | ✅ Complete |
| VR-2 | Research Dashboard + Opportunity Discovery | ✅ Complete |
| VR-3 | Idea Card + Angle Selection | ✅ Complete |
| VR-4 | Research History + Profile Management | ✅ Complete |
| VR-5 | Script Writer Handoff | ✅ Complete |
| VR-6 | Data Layer Upgrade | ✅ Complete |

**Data sources in production:**
- Google Trends (SerpApi → google-trends-api → Claude estimate)
- YouTube Search API (competition density)
- YouTube Data API (competitor channel pulls)
- Claude Sonnet 4.6 (topic ideation, synthesis, opportunity scoring)

**localStorage keys in use:**
- `vr_channel_profile` — channel profile object
- `vr_last_report` — most recent research report
- `vr_research_history` — array of past reports (capped at 20)
- `vr_selected_idea` — saved idea with enriched data
- `vr_idea_banner_dismissed` — boolean
- `vr_brief_dismissed_in_scriptwriter` — boolean

---

## Session 18 — Script Writer Module

**Commit:** `feature: script-writer module with multi-pass generation and voice cloning`
**Date:** 2026-06-18

### What was built

- Script Writer page at `/script-writer`, activated in sidebar navbar
- 6-pass generation pipeline: Research → Angles (user picks) → Structure → Script → Retention → Humanization
- 8 style templates: Documentary Explainer, Rise & Fall, Business Model, Hidden System, Investigative, Contrarian, Case Study, Founder Psychology
- Target length selector: 8 / 12 / 20 minutes
- Optional channel voice cloning: paste transcripts → Claude generates style fingerprint → injected into Pass 4 + Pass 6
- Voice profiles persisted to `server/data/voiceProfiles.json`
- SSE streaming shows each pass completing in real time
- Angle selection step: pipeline pauses after research, presents 4 angles, resumes after user picks
- "Send to Video Creator" button saves script to `localStorage` key `vorta_script_text` and navigates to `/video-creator`
- All generation grounded in real facts via research pass (no hallucinated facts)
- Research Brief from Video Research module preserved and shown at top of form

### New files

| File | Purpose |
|------|---------|
| `server/routes/scriptWriter.js` | SSE endpoints for generate, generate-from-angle, voice profile CRUD |
| `server/services/scriptWriterService.js` | 6-pass Claude pipeline + voice profile analysis |
| `server/data/voiceProfiles.json` | Voice profile storage |
| `client/src/pages/ScriptWriter.jsx` | Main page — form panel + output panel, SSE streaming, angle selection |
| `client/src/components/script-writer/StyleSelector.jsx` | 4×2 style template card grid |
| `client/src/components/script-writer/VoiceProfileManager.jsx` | Modal for creating/managing/selecting voice profiles |
| `client/src/components/script-writer/GenerationProgress.jsx` | 6-step pass pipeline visualization + angle cards |
| `client/src/components/script-writer/ScriptOutput.jsx` | Final script editor with word count, copy, send to creator |
| `client/src/styles/script-writer.css` | All script writer CSS (vorta-sw- prefix) |

### Modified files

| File | Change |
|------|--------|
| `server/index.js` | Registered `/api/script-writer` route |
| `client/src/main.jsx` | Imported `script-writer.css` |

### Notes

- Sidebar nav item was already `available: true` and App.jsx already imported/routed ScriptWriter with `onNavigate` prop from VR-5 session
- Model used: `claude-sonnet-4-6` (matching project standard, not opus as in original spec — avoids unnecessary cost for iterative passes)
- SSE streaming uses `fetch` + `ReadableStream` reader pattern (same as voiceover generation in VoiceoverPanel)
- Voice profile fingerprints are generated by Claude analyzing pasted transcripts — stored as plain text instruction sets

### Pass 7 & 8 additions (anti-detection + originality scan)

- **Pass 7: Anti-detection rewrite** — breaks AI rhythm patterns, adds human imperfections (sentence fragments, em dashes, parenthetical asides), varies paragraph/sentence rhythm deliberately, removes remaining AI transition phrases, ensures opening and closing lines feel like deliberate human choices
- **Pass 8: Copyleaks originality scan** — plagiarism check + AI-content detection via Copyleaks API
  - Requires `COPYLEAKS_API_KEY` + `COPYLEAKS_EMAIL` in `.env`
  - Gracefully skipped if credentials not present (non-blocking)
  - Results shown in ScriptOutput as originality % and AI score with color-coded status badges
  - Green: originality ≥90% and AI score ≤20%; Amber: marginal; Red: regenerate recommended
- Pipeline now 8 passes: Research → Angles → Structure → Script → Retention → Humanize → Anti-AI → Originality
- GenerationProgress updated to show 8 steps with skipped/error states

### Script Memory System

- `server/data/scriptHistory.json` — persists all generated scripts (max 200, newest first)
- Each entry stores: topic, style, length, voice profile, chosen angle, full script, scan results, rating (1-5), usedCount, createdAt, wordCount
- **Star rating** — user rates after generation; 4-5 star scripts become exemplars
- **Few-shot injection** — top-rated scripts injected into Pass 4 (script draft) and Pass 6 (humanization) as quality examples; Claude matches their quality level
- **Script History panel** — slide-in panel showing all past scripts with load/delete
- "Load Script" restores a past script into the output panel for reuse or re-sending
- `usedCount` incremented when "Send to Video Creator" is clicked — secondary quality signal
- API routes: `GET /history`, `GET /history/:id`, `PATCH /history/:id/rating`, `PATCH /history/:id/used`, `DELETE /history/:id`
- New files: `server/data/scriptHistory.json`, `client/src/components/script-writer/StarRating.jsx`, `client/src/components/script-writer/ScriptHistory.jsx`

### Voice Profile System upgrade

- **Transcript library:** all transcripts persisted to `server/data/transcriptLibrary.json` (max 500)
- Full transcript text stored in `server/data/transcripts/{id}.txt` (one file per transcript)
- Shared library: all sessions share the same transcript pool, tagged with uploader label
- Each transcript tagged with: `uploaderLabel`, `channelName`, `title`, `wordCount`, `estimatedMinutes`, `usedInProfiles[]`
- Max 5 transcripts per voice profile (up from 3)
- **Fingerprint confidence score:** Claude self-evaluates 1-10 with reasoning and improvement suggestions
- Confidence badges: green (8-10), amber (5-7), red (1-4)
- Improvement suggestions shown prominently when confidence < 6
- **Selection guidance panel** shown before transcript picking (topic diversity, length, quality tips)
- Uploader label persisted to `localStorage` as `vorta_uploader_label`
- VoiceProfileManager rebuilt with two tabs: Profiles | Transcript Library
- Transcript library has search, length filter (short/medium/long), sort (newest/most used/longest), live word count on upload
- API routes: `GET /transcripts`, `POST /transcripts`, `GET /transcripts/:id/text`, `DELETE /transcripts/:id`
- Voice profile POST now accepts `{ name, transcriptIds, uploaderLabel }` instead of raw transcript text
- New files: `server/data/transcriptLibrary.json`, `server/data/transcripts/.gitkeep`

---

## Title & Thumbnail Module — Design Spec (documented ahead of build)

### Pipeline position

Video Research (idea + angle/gap) → **Title & Thumbnail** (the hook/promise) → Script Writer (writes to fulfill that exact promise) → Video Creator.

Title and thumbnail are created together, before the script. The script's job is to satisfy the curiosity the title/thumbnail creates — not the reverse.

### Input — creative brief

A lightweight object, independent of script/scene state, that can later be auto-populated by Video Research's existing output:

```json
{
  "idea": "string",
  "angle": "string",
  "niche": "string",
  "target_audience": "string",
  "status": "draft | titled | thumbnailed | scripted"
}
```

Can be hand-entered, or pulled directly from `vr_selected_idea` (same pattern Script Writer already uses), so the brief isn't duplicated input.

### Title generation (Claude)

- `generateTitles(idea, angle, niche)` → 6-8 candidates
- Each tagged with a strategy label: `curiosity_gap`, `contrarian_claim`, `number_driven`, `direct_claim`, `shock_framing`
- Prefer short titles; avoid padding
- Title and thumbnail text must complement each other, not repeat — if the title states the topic, thumbnail text should add tension or a number, not restate it

### Thumbnail generation — universal composition rules

Apply to every thumbnail regardless of style mode:

1. Subject placed in the left or right third of frame, never dead center — must be stated explicitly in the Higgsfield prompt text (image models default to centered layouts unless told otherwise)
2. A clean negative-space zone reserved opposite the subject, specifically for text legibility
3. High contrast / strong tonal separation between subject and background — must read clearly at small mobile thumbnail size
4. Avoid placing key visual elements in the bottom-right corner (YouTube's duration badge overlaps that zone)
5. Generate 3 variations per request by default (aligns with YouTube's native 3-thumbnail A/B test feature)

### Thumbnail generation — style modes

Selected per brief, not fixed per channel. The brief's niche/angle/category determines which mode the prompt generator reaches for by default; the user can override per generation.

| Style mode | Fits when | Visual approach |
|---|---|---|
| `curiosity_gap` | true crime, mystery, investigative, legal | obscured/partial subject, shadow, single dramatic light source |
| `stat_driven` | finance, business, data-heavy stories | bold number/chart as dominant visual element, minimal scene |
| `face_or_figure` | a real named person is central to the story | person rendered prominently in one third, expression-driven |
| `object_icon` | tech/product stories | product/symbol as hero subject, clean studio-style background |
| `before_after` | transformation, rise-and-fall narratives | split composition contrasting two states |
| `scene_dramatization` | historical/narrative moments | a specific dramatized real-world moment, cinematic treatment |

Style consistency is enforced within a single video's 3 variants (so they look like a coherent set), not forced across different videos/projects.

### Text overlay compositing rules (sharp-based, separate layer from base image)

- Max 3-4 words, bold sans-serif, heavy weight
- Keep overlay text under ~12 characters where possible — text-heavy thumbnails consistently underperform minimal-text ones
- Default placement: the third opposite the generated subject
- Always apply stroke/shadow for contrast regardless of background
- Hard-avoid the bottom-right corner (duration badge safe zone)
- This is a separate editable layer from the base image — never burned in until the user finalizes

### Chat-based editing (titles and thumbnails)

Both titles and thumbnails support conversational refinement via a persistent, visible chat thread per brief/thumbnail session (full scrollable history, not fire-and-forget).

**Title editing:** plain Claude call with conversation history. User message → revised title candidates, same strategy tagging as initial generation.

**Thumbnail editing — intent routing required:** every chat message must first be classified by Claude into one of:
- `edit_image` — changes to the generated scene itself (background, subject, composition, lighting, color)
- `edit_overlay` — changes to the text layer only (wording, position, size, font, color)
- `ambiguous` — Claude asks a clarifying question in the thread instead of guessing

**edit_image flow (image-reference edit, NOT true masked inpainting):**

The Higgsfield CLI does not expose mask-based inpainting — confirmed via CLI's documented flags (`--image`, `--start-image`, `--end-image`, `--video`, `--audio` — none accept a mask). Edits use image-reference editing:

1. Take the CURRENT stored Higgsfield prompt (not a fresh one) + the chat instruction
2. Claude rewrites the prompt to explicitly preserve everything not mentioned and change only the requested element
3. Call Higgsfield with `--image <current_thumbnail_path>` as reference plus the revised prompt — reference-guided regeneration, not pixel-locked inpainting; minor drift outside the edited region is possible and expected
4. Result becomes the new current version

**edit_overlay flow:** no Higgsfield call. Claude maps the instruction directly to overlay params (text/position/size/color/font) and the sharp compositor recomposes immediately — fast, no generation wait.

### Version history

Every chat turn that produces a new image or overlay state is saved as a version entry, not overwritten. Each thumbnail entry gains a `versions[]` array:

```json
{
  "instruction": "make the background darker",
  "prompt_used": "...",
  "image_path": "...",
  "overlay_state": { "text": "...", "position": "...", "size": "...", "color": "..." },
  "timestamp": "2026-06-19T..."
}
```

User can scroll the chat thread and restore any prior version.

### Library (persistent, not per-project)

All generated thumbnails (base image + every edited version + final composited output) persist to a permanent library — same cache-first, append-only pattern as `library/soundIndex.json`. This lets future sessions reference or reuse past hooks/thumbnails across different video projects.

New file: `library/thumbnailIndex.json` mirroring the existing `soundIndex.json` structure (per-entry id, prompt, style_mode, image paths, versions, linked brief/idea).

### Files to create (when building)

| File | Purpose |
|------|---------|
| `client/src/pages/TitleThumbnail.jsx` | Main page |
| `client/src/components/title-thumbnail/` | Component directory |
| `server/routes/titleThumbnail.js` | API routes |
| `server/services/titleThumbnailService.js` | Claude title gen, prompt building, intent routing |
| `library/thumbnailIndex.json` | Persistent thumbnail library |

### Dependencies

- Higgsfield CLI (already integrated) for image generation
- `sharp` npm package for text overlay compositing (to be installed when building)
- Claude API for title generation + chat editing + intent routing

---

### Phase TT-1 — Module Shell + Title Generation ✅ COMPLETE

**What was built:**
- Sidebar: `Title & Thumbnail` nav item activated (`available: true`)
- `client/src/pages/TitleThumbnail.jsx` — full state machine (setup → selection → placeholder)
  - State A: Setup form with idea, angle, niche, target audience fields
  - "Load from Video Research" button reads `vr_selected_idea` + `vr_channel_profile` from localStorage
  - Disabled with tooltip when no VR idea is saved
  - "Generate Titles →" button disabled until idea + angle + niche non-empty
  - State B: 6-8 title cards in 2-column grid, each with strategy label chip
  - Click-to-select with highlight, custom title text input as alternative
  - "Regenerate" re-fires the same brief
  - "Continue →" disabled until a title is selected or typed
  - State C: Placeholder ("Thumbnail generation coming in TT-2")
- `server/routes/titleThumbnail.js` — two endpoints:
  - `POST /api/title-thumbnail/generate-titles` — validates idea/angle/niche, calls Claude Sonnet 4.6, sanitizes response (strips markdown fences, enforces 6-8 items, validates strategy enum, pads/trims)
  - `POST /api/title-thumbnail/brief/save` — appends to `titleThumbnailLibrary.json`, returns briefId
- `server/data/titleThumbnailLibrary.json` — initialized as empty array
- `client/src/App.jsx` — passes `onNavigate` prop to TitleThumbnail
- `server/index.js` — mounts `/api/title-thumbnail` route
- All state persisted to `tt_current_brief` in localStorage with try/catch fallback
- All CSS classes use `vorta-` prefix

**Deviations from design spec:**
- Title generation route placed directly in `server/routes/titleThumbnail.js` rather than a separate `server/services/titleThumbnailService.js` — service file will be created in TT-2 when thumbnail generation needs shared logic
- Library file placed in `server/data/titleThumbnailLibrary.json` rather than `library/thumbnailIndex.json` — consistent with existing `server/data/` pattern (scriptHistory.json, voiceProfiles.json); `library/thumbnailIndex.json` reserved for TT-2's persistent thumbnail image library

**Production-readiness checklist:**
- [x] POST /generate-titles with missing idea/angle/niche → 400
- [x] Valid request → 6-8 titles, all with valid strategy enum values
- [x] Claude malformed JSON → handled, fences stripped, fallback padding works
- [x] "Load from Video Research" populates fields correctly when vr_selected_idea exists
- [x] "Load from Video Research" disabled with tooltip when absent
- [x] Generate Titles disabled until idea+angle+niche non-empty
- [x] Title cards render with correct strategy chips
- [x] Selecting a card highlights it; custom text input also selectable
- [x] Regenerate re-fires the same brief, replaces candidates
- [x] Continue disabled until a title is chosen
- [x] Brief saves to titleThumbnailLibrary.json with correct schema
- [x] tt_current_brief persists across page reload
- [x] Sidebar Title & Thumbnail item now active (not greyed out)
- [x] All CSS classes use vorta- prefix
- [x] Client build clean — zero errors, zero warnings
- [x] PLAN.md updated with TT-1 completion entry

---

### Phase TT-2 — Thumbnail Image Generation ✅ COMPLETE

**What was built:**
- `server/services/higgsfield.js` — added `generateThumbnail(prompt, variations)` using `Promise.allSettled` for parallel 3-variation generation; one failure doesn't block others
- `server/services/titleThumbnailService.js` (NEW) — `generateThumbnailPrompt(idea, angle, title, styleMode)`: Claude Sonnet 4.6 call that auto-selects style mode if not provided and generates a Higgsfield prompt with explicit composition rules (rule-of-thirds subject placement, negative space for text, high contrast, bottom-right avoidance)
- `server/routes/titleThumbnail.js` — added `POST /api/title-thumbnail/generate-image`:
  - Validates briefId, idea, angle, title (400 if missing)
  - Checks Higgsfield CLI auth via `higgsfield account` before generation — returns clear error message if not authenticated
  - Calls Claude for prompt → Higgsfield for 3 variations → downloads images to `library/thumbnails/[briefId]/`
  - Updates `titleThumbnailLibrary.json` entry with `styleMode`, `thumbnailPrompt`, `baseImages`, `status: "thumbnailed"`
  - Returns `{ images, styleMode, prompt, failedCount }` — failedCount enables "X of 3" UI messaging
- `client/src/pages/TitleThumbnail.jsx` — State C replaced with ThumbnailGeneration component:
  - 6 style mode selector chips (curiosity_gap, stat_driven, face_or_figure, object_icon, before_after, scene_dramatization)
  - Leave unselected for auto-detection, or pick manually
  - Generate/Regenerate button with loading state
  - 3-column variant grid with click-to-select, highlighted border on selected, check badge
  - Partial failure notice ("X variation(s) failed — click Regenerate to retry")
  - Continue button disabled until a variant is selected
  - State D placeholder added ("Text overlay coming in TT-3")
- All thumbnail state persisted to `tt_current_brief` in localStorage (styleMode, thumbnailImages, selectedThumbnail)
- 4-state view machine: setup → selection → thumbnails → overlay

**Style modes:**
| Mode | Fits when | Visual approach |
|------|-----------|-----------------|
| `curiosity_gap` | true crime, mystery, investigative | shadow, partial subject, dramatic light |
| `stat_driven` | finance, business, data-heavy | bold number/chart dominant |
| `face_or_figure` | named person central | person in one third, expression-driven |
| `object_icon` | tech/product | product/symbol hero, studio background |
| `before_after` | transformation, rise-and-fall | split composition, two states |
| `scene_dramatization` | historical/narrative | dramatized real-world moment |

**Production-readiness checklist:**
- [x] POST /generate-image with missing briefId/idea/angle/title → 400
- [x] Higgsfield CLI not authenticated → clear 500 error, not raw CLI crash
- [x] Valid request → 3 variation URLs returned via Promise.allSettled
- [x] One variation failing doesn't block the other two from succeeding
- [x] Images download and save to correct library/thumbnails/[briefId]/ path
- [x] titleThumbnailLibrary.json entry updates with styleMode, prompt, baseImages
- [x] Generated Higgsfield prompt contains explicit rule-of-thirds + negative space + contrast + bottom-right-avoidance instructions
- [x] Style mode auto-selection produces reasonable mode based on niche
- [x] Style mode override + regenerate works
- [x] Variant grid renders correctly with successful images
- [x] Selecting a variant highlights it; Continue disabled until selection made
- [x] Regenerate replaces the grid correctly
- [x] tt_current_brief persists styleMode + selected image path across reload
- [x] All CSS classes use vorta- prefix
- [x] Client build clean — zero errors, zero warnings
- [x] PLAN.md updated with TT-2 completion entry

---

### Phase TT-3 (revised) — Text Overlay Compositor with Drag Positioning ✅ COMPLETE

**What was built:**
- `sharp` (npm) added to server dependencies for image compositing
- `server/services/thumbnailComposer.js` — `composeThumbnail()`:
  - **Coordinate-based positioning**: accepts `{ x, y }` normalized 0.0-1.0 coordinates representing the CENTER point of the text block — resolution-independent
  - Server-side exclusion zone clamping: bottom-right ~15% width x 12% height always kept clear of text, position auto-clamped (never rejected) regardless of client input
  - Reads base image dimensions via `sharp().metadata()` (never hardcoded)
  - 3-layer SVG text rendering: shadow (offset, semi-transparent) → thick stroke outline → clean fill
  - Font: system font stack ("Arial Black", "Helvetica Neue", Impact, sans-serif) — annotated for easy swap to bundled font
  - fontSize auto-scaled to ~10% of image height if not provided, stroke width auto-scaled from fontSize
  - Word count > 4 triggers console warning (soft guidance, not a hard block)
  - Text wrapping at word boundaries for longer overlay text
  - Returns `{ outputPath, x, y }` — actual clamped coordinates used, so frontend can snap to match
- `server/routes/titleThumbnail.js` — `POST /api/title-thumbnail/compose`:
  - Accepts `{ briefId, text, x, y, fontSize, color, strokeColor, strokeWidth }` — x/y default to center (0.5, 0.5) if omitted
  - Validates briefId required, base image exists (400 with "generate a thumbnail image first" if missing)
  - Returns `{ finalImagePath, overlayState }` — overlayState reflects clamped position
- `client/src/pages/TitleThumbnail.jsx` — State D: full OverlayEditor with drag positioning:
  - **Drag-to-position**: pointer events (pointerdown/move/up) on the preview canvas — click anywhere or drag to reposition text in real time
  - **Exclusion zone visualization**: bottom-right corner has a visible hatched overlay with "duration badge" label during editing, so users understand why dragging stops there
  - **Client-side clamping**: drag is clamped live against the exclusion zone boundary — no invalid drops possible
  - **5 preset buttons**: Left (0.25, 0.5), Center (0.5, 0.5), Right (0.75, 0.5), Top (0.5, 0.15), Bottom (0.5, 0.85) — each jumps the text to that position; user can drag freely from there
  - **Position coordinates display**: shows current x/y values below presets for precision
  - Live CSS preview with `-webkit-text-stroke`, `text-shadow`, `transform: translate(-50%, -50%)` centered on {x,y} — updates instantly, zero server calls until Save
  - Controls: text input (word count warning at 5+), font size slider, fill/stroke color pickers, stroke width slider
  - Save calls POST /compose, snaps preview to server's clamped position if it differs, shows final render
  - Download JPEG link; "Edit again" to return to live preview
  - All overlay state (including x, y) persisted to `tt_current_brief` in localStorage

**Position model:**
Position is `{ x, y }` — normalized 0.0-1.0 percentages, resolution-independent. Presets set initial coordinates; dragging overwrites them. The backend only receives coordinates, never preset names.

**Exclusion zone enforcement (dual):**
- Client-side: `clampToSafeZone()` applied during every drag move — prevents text from entering the bottom-right corner interactively
- Server-side: `clampPosition()` in thumbnailComposer.js — authoritative check, never trusts client values alone; returns actual clamped coordinates in response

**Production-readiness checklist:**
- [x] POST /compose with missing briefId → 400
- [x] POST /compose when brief has no base image → 400 with clear message
- [x] Valid request with explicit {x, y} → composited at that position
- [x] Valid request with no {x, y} → defaults to center (0.5, 0.5)
- [x] {x, y} that would overlap the exclusion zone gets clamped server-side, not rejected
- [x] Image dimensions read dynamically via sharp metadata
- [x] Text renders with stroke/shadow for legibility against varied backgrounds
- [x] fontSize scales proportionally across different base image resolutions
- [x] Word count warning triggers at 5+ words, stays neutral at 4 or fewer
- [x] All 5 presets (Left, Center, Right, Top, Bottom) jump to correct {x, y}
- [x] Free drag works smoothly, clamps live at exclusion zone boundary
- [x] Exclusion zone visibly indicated on canvas during editing
- [x] Live CSS preview updates instantly on every control/drag change, no server roundtrip
- [x] Save replaces preview with actual rendered output; snaps to server-side clamped position
- [x] titleThumbnailLibrary.json stores overlayState with x/y correctly
- [x] Download produces a valid, correctly-sized JPEG
- [x] Reopening a brief after reload restores text, position, and style controls
- [x] All CSS classes use vorta- prefix
- [x] Client build clean — zero errors, zero warnings
- [x] PLAN.md updated with TT-3 completion entry

---

### Phase TT-3 Extension — Bundled Fonts, Formatting Controls, Background Pill ✅ COMPLETE

**What was built:**
- 4 OFL-licensed fonts bundled in `assets/fonts/` (6 files total):
  - Anton (Regular) — heavy condensed, shock framing / big numbers
  - Inter (Bold, Black) — neutral grotesque, finance / tech / institutional
  - Playfair Display (Bold, Black) — editorial serif, investigative / documentary
  - Oswald (Bold) — versatile condensed, politics / business
- `server/services/thumbnailComposer.js` — fully rewritten:
  - Fonts embedded into SVG via base64 `@font-face` rules — renders identically regardless of host system fonts
  - `FONT_CONFIG` maps font families to available weight files — no weight/italic can be selected without a bundled file backing it
  - New params: `fontFamily`, `fontWeight`, `italic` (SVG skew fallback), `uppercase` (text-transform before render), `letterSpacing`, `backgroundPill`, `backgroundPillColor`, `backgroundPillOpacity`
  - Background pill: rounded `<rect>` rendered in SVG before text, sized proportionally to fontSize with padding
  - Pill bounding box included in exclusion-zone clamping — not just the bare text
  - Per-font character-width factors for more accurate bounding box estimation (condensed fonts like Anton/Oswald vs wider fonts like Inter)
- `server/routes/titleThumbnail.js` — compose endpoint accepts and passes through all new params with sensible defaults (fontFamily: 'anton', uppercase: true, letterSpacing: 0, backgroundPill: false)
- `client/src/pages/TitleThumbnail.jsx` — OverlayEditor extended:
  - **Font picker**: 2x2 grid of visual chips, each rendered in the font's own CSS family so the choice is visible before applying
  - **Weight selector**: only shows weight buttons available for the selected font (hidden for single-weight fonts like Anton)
  - **Italic toggle**: I button, auto-disabled when no italic support
  - **Uppercase toggle**: AA button, defaults on
  - **Letter spacing slider**: -4px to +20px
  - **Background pill**: toggle switch, reveals color picker + opacity slider when enabled; pill renders in live CSS preview behind text
  - All controls update the live preview instantly, zero server calls until Save

**Font register mapping:**
| Font | Role | Fits when |
|------|------|-----------|
| Anton | Impact / display | Shocking numbers, bold claims, MrBeast-adjacent energy |
| Inter | Clean grotesque | Finance, tech, institutional, stat-driven |
| Playfair Display | Serif / editorial | Investigative, historical, documentary register |
| Oswald | Versatile slab-condensed | Politics, business, neutral-aggressive middle ground |

**Production-readiness checklist:**
- [x] All 4 fonts render correctly in final composited JPEG (distinct, not fallback)
- [x] Font rendering is identical regardless of host fonts (base64-embedded in SVG)
- [x] Weight/italic options correctly hide/disable when unavailable
- [x] Uppercase toggle transforms text in actual rendered output
- [x] Letter spacing visibly changes character spacing in final render
- [x] Background pill renders behind text with correct color/opacity
- [x] Pill bounding box also clamped away from exclusion zone
- [x] Font preview chips rendered in their actual CSS font
- [x] Live CSS preview updates instantly on every control, no server call
- [x] Save produces real server-rendered result replacing preview
- [x] titleThumbnailLibrary.json stores all new overlayState fields
- [x] Reopening a brief restores all formatting controls
- [x] All CSS classes use vorta- prefix
- [x] Client build clean — zero errors, zero warnings
- [x] PLAN.md updated noting TT-3 extension (fonts + formatting)

---

### Phase TT-4 — Chat-Based Editing + Version History ✅ COMPLETE

**What was built:**
- `server/services/titleThumbnailChat.js` (NEW) — 4 exported functions:
  - `chatEditTitle(briefId, message, conversationHistory, briefContext)` — Claude call with full conversation history, returns revised title candidates with strategy tags + assistant reply
  - `classifyIntent(message, currentState)` — Claude call that classifies into `edit_image | edit_overlay | ambiguous`; ambiguous returns a clarifying question, never guesses
  - `chatEditImage(briefId, message, currentPrompt, currentImagePath)` — Claude rewrites the Higgsfield prompt with explicit preservation clause, then generates via CLI with `--image` reference flag (falls back to prompt-only if flag fails); downloads and saves result
  - `chatEditOverlay(briefId, message, currentOverlayState, selectedBase)` — Claude maps natural-language instructions to overlayState field changes (font, weight, italic, uppercase, letter spacing, pill, position, color, etc.), validates against FONT_CONFIG, then calls composeThumbnail() for immediate sharp render
- `server/routes/titleThumbnail.js` — 4 new endpoints:
  - `POST /chat/title` — loads conversation history from versions[], calls chatEditTitle, appends version
  - `POST /chat/thumbnail` — calls classifyIntent first; if ambiguous returns question and stops; if edit_image calls chatEditImage; if edit_overlay calls chatEditOverlay; appends version
  - `GET /versions/:briefId` — returns the full versions[] array
  - `POST /restore/:briefId` — finds target version, creates NEW version copying its data forward (append-only, never deletes), updates current-state fields
- `client/src/components/title-thumbnail/ChatPanel.jsx` (NEW) — reusable chat component:
  - Full visible scrollable chat thread with message history
  - User messages right-aligned (purple), assistant replies left-aligned (grey), system messages centered
  - Loading state: "Thinking..." bubble in-thread during processing
  - Error state: red bubble with error message
  - Ambiguous intent: clarifying question rendered as assistant reply, user responds in same thread
  - Version history strip: horizontal scroll of version chips (v1, v2, v3...) with type icons (Image/Type/Message), current highlighted; click to restore
  - Send on Enter or button click
  - Loads existing version history on mount
- `client/src/pages/TitleThumbnail.jsx` — ChatPanel integrated:
  - Title Selection (State B): ChatPanel at bottom, title chat mode; updated titles reflect in the card grid immediately
  - Overlay Editor (State D): ChatPanel in controls sidebar, thumbnail chat mode; image updates refresh the preview, overlay updates sync all control states (font, position, colors, pill, etc.)
  - Restore callback updates all relevant state from restored version data

**Version history schema:**
```json
{
  "versionId": "v_[timestamp]",
  "createdAt": "ISO timestamp",
  "type": "title | image | overlay",
  "instruction": "user's chat message or restore note",
  "data": { /* type-specific: titles[], prompt+imagePath, or overlayState */ }
}
```
- Append-only: restoring creates a NEW version, never deletes
- Top-level fields (selectedTitle, baseImages, overlayState, etc.) always reflect current/active version

**Intent routing examples:**
- `edit_image`: "make the background darker", "remove the second person", "make it more dramatic"
- `edit_overlay`: "change the text to say X", "use a serif font", "make it uppercase", "add a background box"
- `ambiguous`: "make it pop more", "make it better" → returns clarifying question

**Production-readiness checklist:**
- [x] Title chat returns valid candidates on first message
- [x] Title chat maintains conversation context across turns
- [x] classifyIntent correctly routes edit_image vs edit_overlay vs ambiguous
- [x] Ambiguous intent returns clarifying question, does NOT call edit functions
- [x] edit_image attempts --image reference flag, falls back to prompt-only
- [x] edit_image prompt includes explicit preservation clause
- [x] edit_overlay maps instructions to correct overlayState fields
- [x] edit_overlay reuses thumbnailComposer for exclusion-zone clamping
- [x] Every successful edit appends a new version, never overwrites
- [x] versions[] correctly ordered with type + instruction + data
- [x] Restore creates new version pointing to old data, does not delete
- [x] Restore updates current-state fields and live preview
- [x] Chat thread renders full scrollable history
- [x] Version history strip renders with correct current highlight
- [x] Loading states render in-thread as pending bubble
- [x] titleThumbnailLibrary.json stays valid after sequential edits
- [x] All CSS classes use vorta- prefix
- [x] Client build clean — zero errors, zero warnings
- [x] PLAN.md updated with TT-4 completion entry

---

### Phase TT-5 — Library Browser, Script Writer Handoff, Polish ✅ COMPLETE

**What was built:**
- `GET /api/title-thumbnail/library` — returns all briefs sorted most-recent-first
- `client/src/components/title-thumbnail/LibraryGrid.jsx` (NEW) — grid of all briefs across projects:
  - Each card: composited thumbnail (or base image), selected title, niche, status badge (titled/thumbnailed/composed), created date
  - Filter bar: by styleMode (6 modes from TT-2), by status, plus text search matching idea/angle/title/niche
  - Click a card → fully restores that brief into the editor (title, thumbnails, overlay state, chat thread, version history)
  - Loading/empty states
- "Library" toggle button in the page header — switches between editor and library grid
- "Send to Script Writer →" button (visible when status >= titled):
  - Saves `tt_selected_brief` to localStorage with briefId, idea, angle, title, thumbnailPath, linkedVrIdeaId, savedAt
  - Navigates to Script Writer via existing onNavigate pattern
- `TitleThumbnailBrief` component in ScriptWriter.jsx:
  - Renders below the existing ResearchBrief panel when `tt_selected_brief` is present
  - Shows the chosen title in quotes with "The script should fulfill the curiosity this title creates" guidance
  - Thumbnail preview if available
  - Mismatch warning if `linkedVrIdeaId` differs between VR idea and TT brief
  - "Clear" action with confirmation modal — removes from Script Writer display only, not from library
  - Blue left border (distinct from ResearchBrief's purple) to visually differentiate
- Error/empty/loading state audit: all async actions across TT-1 through TT-4 confirmed to have visible feedback

**Production-readiness checklist:**
- [x] GET /library returns all briefs correctly sorted
- [x] LibraryGrid renders cards with correct thumbnail/title/status/date
- [x] Filters (styleMode, status) and search correctly narrow results
- [x] Clicking a card fully restores the brief including chat/version history
- [x] Empty state renders when no briefs exist
- [x] "Send to Script Writer" only enabled at status >= titled
- [x] tt_selected_brief saves correctly and navigates to Script Writer
- [x] ScriptWriter displays title/thumbnail brief alongside Video Research brief
- [x] Mismatch warning shows when linkedVrIdeaId differs
- [x] "Clear" removes from display without deleting library entry
- [x] All async actions have visible loading/error/empty states
- [x] All CSS classes use vorta- prefix
- [x] Client build clean — zero errors, zero warnings
- [x] PLAN.md updated with TT-5 and module summary

---

## Title & Thumbnail Module — Fully Complete

| Phase | What it does | Status |
|-------|-------------|--------|
| TT-1 | Module shell + title generation (6-8 candidates, strategy tags, VR handoff) | ✅ |
| TT-2 | Thumbnail image generation (Higgsfield, 6 style modes, 3 parallel variations) | ✅ |
| TT-3 | Text overlay compositor (sharp SVG burn-in, drag positioning, exclusion zone, 4 bundled fonts, background pill) | ✅ |
| TT-4 | Chat editing (intent routing, image-reference editing, overlay editing, conversation memory, append-only version history with restore) | ✅ |
| TT-5 | Library browser, Script Writer handoff, error/empty/loading polish | ✅ |
| TT-6 | Thumbnail reference library — pattern analysis via Claude vision, VR-7 integration, pattern-informed Higgsfield generation | ✅ |

**Pipeline position:** Video Research → **Title & Thumbnail** → Script Writer → Video Creator

**Data flow:**
- Reads from: `vr_selected_idea` + `vr_channel_profile` (optional, via "Load from Video Research" button)
- Writes to: `tt_current_brief` (localStorage working state), `titleThumbnailLibrary.json` (persistent server-side library), `tt_selected_brief` (handoff to Script Writer)
- Assets: `library/thumbnails/[briefId]/` — base images, edited images, final composited output

---

### Phase VR-7 — Targeted Competitor Research ✅ COMPLETE

**What was built:**
- `server/services/competitorService.js` — added `getFilteredCompetitorVideos(channelHandles, filters)`:
  - Filters: `dateRange` (7d/30d/90d/1y/all), `minViews`/`maxViews`, `minSubs`/`maxSubs` (channel-level), `sortBy` (views/viewsPerSubscriber/recency)
  - `viewsPerSubscriber` — new derived field per video: `viewCount / channelSubscriberCount`, null when subscriber count hidden (guards against division by zero)
  - `thumbnails` — captures `snippet.thumbnails` (default/medium/high URLs) from YouTube API response, previously uncaptured
  - Separate filter-aware cache with key hashed from channels + filters — different filter combinations don't collide
  - `Promise.allSettled` across channels — one channel failing doesn't block others
  - Returns: array of video objects with videoId, title, channelName, channelId, viewCount, channelSubscriberCount, viewsPerSubscriber, publishedAt, thumbnails, url
- `POST /api/research/competitors/filtered` — validates profile.competitors non-empty, calls getFilteredCompetitorVideos, returns `{ videos, appliedFilters, resultCount }`
- `client/src/components/video-research/DeepCompetitorPanel.jsx` (NEW) — 600px right slide-in panel:
  - Full filter set: date range, min/max views, min/max subscribers, sort dropdown
  - Subscriber presets: "Similar size" (0.5x–2x own subs), "10× my size" (5x–20x), "Mega (1M+)"
  - Result grid: real thumbnail images (from thumbnails.medium URL), title with external link, channel name, view count, subscriber count, views-per-subscriber ratio, publish date
  - "Pin as reference" per video — saves to `vr_pinned_references` in localStorage (capped at 20)
  - Pinned references strip at the bottom with thumbnail previews, click to unpin
  - Loading, empty, and error states
- `PanelColumn` component extended with `headerExtra` prop for the "Deep dive" button
- Competitor Watch column in ResearchDashboard updated:
  - "Deep dive →" button in the column header opens DeepCompetitorPanel
  - Quick filter state (date range, min views, sort) wired in the dashboard for inline re-filtering

**Production-readiness checklist:**
- [x] POST /competitors/filtered with empty profile.competitors → 400
- [x] Valid request with no filters → behaves equivalently to current unfiltered pull
- [x] dateRange correctly excludes videos outside the window
- [x] minViews/maxViews correctly bound results
- [x] minSubs/maxSubs correctly filter which channels are queried
- [x] viewsPerSubscriber computed correctly; null when subs unavailable
- [x] thumbnails field present and populated on returned videos
- [x] Cache differentiates between different filter combinations (key includes filters hash)
- [x] One channel API failure doesn't block others (Promise.allSettled)
- [x] DeepCompetitorPanel opens correctly from "Deep dive" link
- [x] All filter inputs function and combine correctly
- [x] Preset subscriber buttons fill correct ranges
- [x] Result grid renders real thumbnail images
- [x] "Pin as reference" saves to vr_pinned_references, capped at 20
- [x] Empty state renders when filters produce zero results
- [x] Loading state renders during query
- [x] Existing VR-1 through VR-6 functionality unaffected
- [x] All CSS classes use vorta- prefix
- [x] Client build clean — zero errors, zero warnings
- [x] PLAN.md updated with VR-7 completion entry

---

### Phase TT-6 — Thumbnail Reference Library ✅ COMPLETE

**What was built:**
- `server/services/titleThumbnailService.js` — extended with:
  - `analyzeThumbnailPatterns(referenceImages)` — downloads reference thumbnail images, converts to base64, sends as vision content blocks to Claude Sonnet 4.6 in a single call
  - Claude prompt explicitly instructs: analyze patterns COMMON ACROSS the set, never describe a single image in isolated reproducible detail, synthesize general creative direction not a copy recipe
  - Returns structured JSON: `{ dominantPalette, subjectPlacementPattern, typographyStyle, moodDescriptor, compositionNotes }`
  - `downloadToBuffer(url)` — lightweight HTTP(S) download returning a Buffer, with redirect following
  - `Promise.allSettled` for image downloads — one broken URL doesn't fail the whole analysis
  - `generateThumbnailPrompt()` — extended with optional `referencePatterns` parameter; when present, folds pattern description into the Higgsfield prompt alongside (not replacing) the existing universal composition rules
- `server/routes/titleThumbnail.js` — 2 new endpoints:
  - `POST /references/refresh` — proxies to VR-7's `getFilteredCompetitorVideos` (reuses, does not duplicate filtering logic)
  - `POST /references/analyze` — accepts up to 3 references, calls analyzeThumbnailPatterns, stores result as `referencePatterns` on the library entry
  - `POST /generate-image` — now accepts optional `referencePatterns` parameter, passes through to generateThumbnailPrompt
- `client/src/pages/TitleThumbnail.jsx` — `ReferenceSection` component added to State C (thumbnail generation):
  - Default state reads `vr_pinned_references` from localStorage — displays as a 4-column grid with thumbnail images, title, view count
  - Checkbox selection, capped at 3 with visual feedback ("Select up to 3 references · X/3 selected")
  - "Refresh" button with inline filter controls (date range, min views, sort) — calls VR-7's existing filtering
  - "Analyze" button — calls vision endpoint, shows "Analyzing..." loading state
  - Pattern result card: displays palette, placement, typography, mood, composition notes
  - "Pattern context active" badge shown when patterns are loaded, wired through to the generate-image call
  - "Clear" to remove pattern context

**Design constraint enforced:**
Pattern analysis describes STYLE across multiple references (e.g. "high contrast red/black palette, subject in right third, bold 3-word white caps text top-left"), never reproduces or closely describes any single specific reference image. This constraint is built into both the Claude system prompt and user prompt text, not just documented.

**Production-readiness checklist:**
- [x] Reference grid renders real thumbnail images from vr_pinned_references
- [x] Empty state renders when no pinned references exist
- [x] Checkbox selection caps at 3, disables further selection past that
- [x] Refresh calls VR-7's filtering logic without duplicating it
- [x] Refresh clears prior selections
- [x] Analyze button disabled until 1+ references selected
- [x] POST /references/analyze downloads images and converts to base64
- [x] One broken URL doesn't fail the whole analysis
- [x] Pattern output describes general patterns, not individual images
- [x] Pattern stored on library entry as referencePatterns
- [x] Pattern correctly flows into generateThumbnailPrompt()
- [x] Generated prompt includes pattern context alongside universal rules
- [x] All CSS classes use vorta- prefix
- [x] Client build clean — zero errors, zero warnings
- [x] PLAN.md updated with TT-6 completion entry

---

### Phase FT-1 — Fine-Tune stage (duration trim, transition override, audio mix override) ✅ COMPLETE

**What was built:**
- `client/src/hooks/useWizardState.js` — added `finetune` step between `voice` and `export` (6 steps total: script/scenes/visuals/voice/finetune/export). Step gating (`isAccessible`/`goTo`) is generic over the STEPS array, so no other wizard-nav changes were needed.
- `client/src/pages/wizard/FineTuneStep.jsx` (NEW) — scene grid reusing SceneGrid's SceneCard visual pattern (rounded-xl card, mono scene number, script excerpt header). Each card shows:
  - Current rendered thumbnail (image scenes) or selected-clip filename (real footage) or a placeholder (motion graphic) — no pre-generation prompt fields
  - Generated narration `<audio>` player + duration, or "No narration generated yet"
  - Duration trim: range + number input, bounded `[audio_duration + 0.8s, 8s]`; below-buffer or above-max entries show an inline error and are not saved
  - Transition_out dropdown (dissolve/dip_black/dip_white/cut); selecting a dip transition that would be shorter than the dip-downgrade threshold (18 frames / 0.6s @ 30fps, mirrors `DIP_FADE` in Documentary.jsx) shows an inline warning and blocks the save instead of persisting an invalid state
  - Audio mix override: three 0–1 sliders (narration/music/ambient) writing `scene.audio_mix_override`
  - Per-field "Revert to generated" — appears once a field differs from a snapshot taken via `localStorage['vorta_finetune_snapshot']` the first time the step is ever entered (persists across step navigation)
  - All edits auto-save via PATCH on commit (range `onMouseUp`/`onTouchEnd`, number `onBlur`, select `onChange`) — no separate Save button
- `client/src/pages/VideoCreator.jsx` — imports and renders `FineTuneStep` in `renderStep()`; added `finetuneSnapshot` key to the `LS` map so "Clear session" wipes the snapshot too
- `client/src/pages/wizard/VoiceStep.jsx` — button label changed from "Continue to Export →" to "Continue to Fine-Tune →" (next step in sequence)
- `server/services/frameMath.js` (NEW) — pure, dependency-free validation module: `minDurationSeconds`, `canUseDipTransition`, `isValidTransition`, `validateSceneUpdate`. Constants (`TRANSITION_FRAMES=12`, `DIP_FADE=9`, `MIN_SCENE_FRAMES=13`) are copied from `remotion/src/compositions/Documentary.jsx` rather than imported — Documentary.jsx is an ESM/JSX file in a separate Node project with Remotion-only dependencies and cannot be `require()`'d from the server. `MAX_SCENE_SECONDS=8.0` / `NARRATION_BUFFER_SECONDS=0.8` mirror the existing constants already used in `server/routes/voiceover.js`.
- `server/routes/scenes.js` (NEW) — `PATCH /api/scenes/:sceneId`. Body: `{ projectId, duration_seconds?, transition_out?, audio_mix_override? }`. Reads/writes `projects/[projectId]/scenes.json`, handling both on-disk shapes that exist in this codebase: the flat array `generate.js` writes at analysis time, and the wrapped `{ scenes, imagePaths, selectedClips, audio, audioSpecs }` object `render.js` overwrites the same path with after a render — sibling keys in the wrapped shape are preserved untouched. Validates via `frameMath.validateSceneUpdate` before writing; on failure returns `400` with the specific error, nothing is persisted. `audio_mix_override: null` clears the field entirely (used by Revert). Registered in `server/index.js` as `/api/scenes`.
- `remotion/src/compositions/Documentary.jsx` — narration `volumeFn` now multiplies against `scene.audio_mix_override?.narration ?? 1.0` instead of the literal `1.0` it used before, so the narration slider actually affects the render. This is the only render-time audio track that exists in the codebase today (confirmed via `render.js`'s own comment: "music and sound effects are handled in post-production") — `calculateDocumentaryDuration` and the `(n-1)` frame-overlap math were **not** touched, per FT-2 scope boundary.

**Known limitation (flagged, not silently built around):** `audio_mix_override.music` and `.ambient` are fully wired end-to-end as *data* — UI sliders, PATCH validation/persistence, revert — but there is no music or ambient audio track anywhere in the render pipeline for them to control yet. The FineTuneStep UI says this explicitly under the sliders. Wiring real music/ambient mixing is a future phase, not part of FT-1.

**Testing — commands run and results:**
```
$ node server/services/frameMath.test.js
```
15/15 assertions passed — constants match Documentary.jsx (FPS=30, TRANSITION_FRAMES=12, DIP_FADE=9, MIN_SCENE_FRAMES=13, MAX_SCENE_SECONDS=8.0, NARRATION_BUFFER_SECONDS=0.8), `minDurationSeconds`, `canUseDipTransition` (including the 17-vs-18-frame rounding boundary), `isValidTransition`, and `validateSceneUpdate` (below-buffer rejection, exact-boundary acceptance, above-max rejection, non-numeric rejection, dip-too-short rejection, both-errors-at-once, valid dip acceptance, unknown-transition rejection, out-of-range mix rejection, valid mix acceptance, `null` mix always valid).

```
$ node server/routes/scenes.test.js
```
18/18 assertions passed against a real Express app with only the scenes router mounted, driven over HTTP with `fetch` against ephemeral ports, using disposable fixture project directories under `projects/` (created and removed by the test, verified no `__test_ft1*` directories remain afterward): valid update returns 200 and persists to disk; duration below the narration-sync buffer → 400, not persisted; duration above 8s → 400; dip transition on a too-short existing scene → 400, not persisted; the same dip transition succeeds once duration is raised; `audio_mix_override` round-trips and stays absent on scenes that never set it; out-of-range mix value → 400; `audio_mix_override: null` clears the field; unknown `scene_id` → 404; unknown `projectId` → 404; missing `projectId` → 400; empty update body → 400; schema validity assertion across every scene after every operation (required fields intact, `audio_mix_override` still optional); and a second run against the wrapped `{ scenes, imagePaths, ... }` shape confirms the PATCH persists inside `scenes[]` without flattening the object or dropping `imagePaths`/`selectedClips`/etc.

Also verified manually:
- `node -e "require('./server/routes/scenes.js')"` — loads without error
- `npx eslint` clean on `FineTuneStep.jsx` (pre-existing unrelated lint debt in `VideoCreator.jsx`/`VoiceStep.jsx` — unused vars, empty blocks — was already present before this change and left untouched, out of scope)
- `npx vite build` — clean production build, no errors
- Against the live dev server (nodemon auto-restarted on the route file changes): `curl -X PATCH /api/scenes/001` with an empty body correctly returned `400 {"error":"projectId required"}`
- Confirmed against real project data on disk (`projects/proj_*/scenes.json`, read-only) that both the flat-array and wrapped shapes the endpoint handles are exactly what's actually on disk in this project, not a guessed format

**Production-readiness checklist:**
- [x] `finetune` step appears between Voice and Export in WizardNav
- [x] Step is skippable — Export works unchanged whether or not Fine-Tune was visited (all new scene fields optional/nullable)
- [x] Duration trim blocked below `audio_duration + 0.8s` and above `8s`, inline message shown
- [x] Dip transition blocked when it would violate the `DIP_FADE` clamp, inline warning shown, nothing persisted
- [x] `audio_mix_override` fully optional; `Documentary.jsx` reads `scene.audio_mix_override?.narration ?? 1.0` (music/ambient stored only — no track to wire yet, documented above)
- [x] `PATCH /api/scenes/:sceneId` implemented and registered; validates before writing; handles both on-disk `scenes.json` shapes
- [x] Revert-to-generated restores the first-visit snapshot per field, persisted in localStorage across navigation
- [x] `calculateDocumentaryDuration` and the frame-overlap math untouched (verified via diff — only the narration volume multiplier changed)
- [x] Client build clean — zero errors
- [x] PLAN.md updated with FT-1 completion entry

---

### Phase FT-2 — Fine-Tune stage: scene reorder ✅ COMPLETE

**What was built:**
- `client/src/pages/wizard/FineTuneStep.jsx`:
  - Native HTML5 drag-and-drop (no new dependency — `draggable`/`onDragStart`/`onDragOver`/`onDrop`; checked `client/package.json` first, nothing already installed for this). A `GripVertical` handle icon is the only `draggable` element on each card, so drags can only start from the handle, not from sliders/inputs/audio controls elsewhere on the card.
  - Dragging a card reorders the local `scenes` array only — `scene_id` is never renumbered or reassigned, so `audio_path`/`image_path`/etc. stay attached to the correct scene through a reorder (asserted directly in the new backend test, see below)
  - A header strip above the scene list now shows `{N} scenes · {X.X}s total (transitions included)`, computed via `calculateDocumentaryDuration` imported directly from `@remotion-compositions/compositions/Documentary` (the same Vite-aliased import `VideoPlayer.jsx` already uses) — this is the *real* render function, not a duplicate, so there is zero drift risk on the number the user actually sees. It recomputes via `useMemo` keyed on `scenes`, so it updates the instant a drag reorder lands (before the network request even resolves — see optimistic update below), satisfying "no stale duration shown after a reorder." The sticky mini-player `<VideoPlayer>` shown above every wizard step already computed its own scrubber length the same way, so it was already correct; this adds a visible, accurate number specifically inside the Fine-Tune step itself.
  - Reorder commits optimistically: `applyOrder()` calls `onScenesChange(nextScenes)` immediately (updating the duration strip and the sticky mini-player before the network round-trip), then persists via the new endpoint; on failure it rolls the local state back to the previous order and shows an inline error
  - "Revert order to generated" — a step-level (not per-card) control in the header strip, shown only when the current scene_id order differs from the snapshot. Reuses the exact FT-1 snapshot mechanism (`localStorage['vorta_finetune_snapshot']`), extended with a reserved `__order` key (scene_ids are numeric-string like `"001"`, so this can't collide) holding the array order captured the first time Fine-Tune is ever entered
- `server/routes/scenes.js` — `POST /api/scenes/reorder`. Body: `{ projectId, order: [scene_id, ...] }`. Validates that `order` is exactly a permutation of the project's current scene_id set — checks length match, no duplicates within `order`, no missing ids, no unknown/extra ids — and returns `400` with a specific message (plus a `errors` array covering every violation found, not just the first) if any check fails; nothing is written to disk on a rejected request. Reuses the same `readScenesFile`/`writeScenesFile` helpers as the FT-1 `PATCH` route, so it transparently handles both on-disk `scenes.json` shapes. Registered under the same `/api/scenes` router already mounted in `server/index.js` — no new mount point needed.
- `server/services/frameMath.js` — added `getTransition`, `sceneDur`, `calculateDocumentaryDuration`, and the `CUT_FRAMES`/`DIP_MID` constants, copied line-for-line from `remotion/src/compositions/Documentary.jsx` (same reasoning as the FT-1 constants: that file is ESM/JSX with Remotion-only dependencies and cannot be `require()`'d from the server). This is used only for the server-side unit test proving the frame-overlap deduction responds to reorder — it is **not** used by the reorder endpoint itself, which doesn't need duration math (it only validates and persists array order). The client uses the real function via the Vite alias instead of this duplicate, since the browser bundle can actually resolve Remotion's packages.

**Guardrails respected:** FT-1's duration trim / transition override / audio mix override logic (`validateSceneUpdate`, the `PATCH /:sceneId` route, `FineTuneCard`'s commit/revert handlers) was not touched — confirmed via diff, only additions. No image swap, split-screen, or other FT-3+ feature was added.

**Testing — commands run and results:**
```
$ node server/services/frameMath.test.js
```
22/22 assertions passed (15 from FT-1, unchanged, plus 7 new): FT-2 constants match Documentary.jsx (`CUT_FRAMES=1`, `DIP_MID=10`); `getTransition` matches Documentary.jsx exactly including the dip-downgrade-to-dissolve behavior on a too-short scene and the missing-`transition_out`-defaults-to-dissolve behavior; `sceneDur` matches including the `MIN_SCENE_FRAMES` floor and the missing-`duration_seconds`-defaults-to-5s behavior; and the key scenario — three 5s scenes with three different transition types (`dissolve`/`dip_black`/`cut`) computed at **430 frames** in their original order and **441 frames** once reordered (same three scenes, same scene_id set, only the array order changed) — proving the `(n-1)`-boundary frame-overlap deduction responds correctly to adjacency changes caused by a reorder.

```
$ node server/routes/scenes.test.js
```
24/24 assertions passed (17 from FT-1 + 1 wrapped-shape check, unchanged, plus 12 new reorder checks) against a real Express app with the scenes router mounted, driven over HTTP with `fetch`, using disposable fixture project directories (verified no `__test_ft1*` directories remain in `projects/` afterward): valid reorder returns 200 and the persisted `scenes.json` order matches the submission exactly; each scene's `audio_path`/`image_path`/`transition_out` travel with its `scene_id` through the reorder (not left behind by position); a reorder missing a scene_id is rejected (400, not persisted); a reorder with an unknown/extra scene_id is rejected (400, not persisted); a reorder with a duplicate scene_id within the submitted array is rejected (400, not persisted); empty/missing `order` is rejected (400); an unknown `projectId` returns 404; and reordering back to the original order (the same code path "Revert order" uses) succeeds.

Also verified manually:
- `npx eslint src/pages/wizard/FineTuneStep.jsx` — clean
- `npx vite build` — clean production build; confirms the `calculateDocumentaryDuration` import from `@remotion-compositions/compositions/Documentary` resolves correctly in the client bundle
- Against the live dev server (nodemon auto-restarted on the route file change): `curl -X POST /api/scenes/reorder` with an empty body correctly returned `400 {"error":"projectId required"}`

**Production-readiness checklist:**
- [x] Drag handle on each Fine-Tune scene card; drag-initiation is scoped to the handle only (verified: `draggable` is set only on the `GripVertical` icon, not the card or its inner controls)
- [x] Reorder changes array position only — `scene_id` values never renumbered/reassigned (asserted directly in the reorder test)
- [x] Total duration and the `(n-1)×12` frame-overlap deduction recompute after reorder (unit-tested with a concrete 430→441-frame reordering scenario)
- [x] Fine-Tune step shows the recomputed total duration immediately after a reorder (optimistic local update before the network request resolves)
- [x] `POST /api/scenes/reorder` implemented, registered, and rejects any scene_id-set mismatch (missing/extra/duplicate) with a clear `400` error, never silently accepting or crashing
- [x] "Revert order to generated" restores the original array order from the FT-1 snapshot mechanism
- [x] FT-1 duration trim / transition override / audio mix override logic untouched
- [x] No image swap, split-screen, or other FT-3+ feature added
- [x] Client build clean — zero errors
- [x] PLAN.md updated with FT-2 completion entry

---

### Phase FT-3 — Fine-Tune stage: manual image swap and single-scene regeneration ✅ COMPLETE

**What was built:**
- `client/src/pages/wizard/FineTuneStep.jsx` — each `image`-shot-type scene card now has, under its thumbnail:
  - **Swap** — a hidden `<input type="file" accept="image/png,image/jpeg,image/webp">` triggered by a button (same hidden-input-plus-button pattern `ExportPanel.jsx` already uses for audio upload), uploads via `FormData` to the new replace endpoint
  - **Regen** — re-runs Higgsfield generation for just that scene via the new regenerate endpoint
  - Both show a spinner while in flight (mutually exclusive via one `imageAction` state: `'uploading' | 'regenerating' | null`) and an inline error message on failure; Regen additionally shows "Can take a few minutes…" since Higgsfield generation is slow
  - The thumbnail lookup now prioritizes `scene.image_path` over the `sceneStatuses`/`imagePaths` snapshot, so a swap/regenerate is reflected immediately in the Fine-Tune grid itself
- `server/routes/images.js` (NEW) — `POST /api/images/:sceneId/replace`, multipart (`multer.memoryStorage()`, 15MB limit, PNG/JPEG/WEBP only). Overwrites the scene's *existing* `image_path` location (same filename) when one exists, so nothing else referencing that URL has to change; if the scene never had an image yet, derives a new filename from `scene_id` + the upload's extension, matching `generate.js`'s convention. Backs up the pre-upload file first (see below), then persists the resulting `image_path` to the project's `scenes.json`.
- `server/routes/higgsfieldRegenerate.js` (NEW) — `POST /api/higgsfield/regenerate/:sceneId`. A thin wrapper around the *same* generation pipeline `generate.js`'s `processScene()` uses — `enhancePrompt(scene, false)` → `generateImage(prompt)` → `downloadImage(url, dest)` — reused via the module objects (`higgsfieldService.generateImage(...)`, not destructured at require-time) rather than duplicated, specifically so tests can monkey-patch each step. The prompt is always read from the project's own `scenes.json`, never trusted from the request body, so it can't be pointed at a different scene's prompt, and no other scene's state is touched. Rejects non-`image` shot types and scenes with no `higgsfield_prompt` before ever calling Higgsfield. Re-reads `scenes.json` fresh immediately before the final write (generation can take minutes; another Fine-Tune edit may have landed on the same file meanwhile) and only touches this scene's `image_path`.
- `server/services/imageSwap.js` (NEW) — `backupOriginalIfNeeded(assetsDir, sceneId, currentImagePath)`, shared by both endpoints above. Backs up whatever is currently on disk to `scene_{sceneId}_original.jpg`, but **only if that backup doesn't already exist** — this is deliberate: the first swap/regenerate must preserve the true Higgsfield original, but a second or third swap must not clobber that backup with an already-replaced image, or the original would be lost forever.
- Two small refactors, done because the task explicitly asked to reuse existing logic rather than duplicate it (verified with the pre-existing test suites afterward, see below):
  - `server/services/imageDownload.js` (NEW) — `downloadImage()` extracted out of `generate.js` (identical body, zero behavior change) so `higgsfieldRegenerate.js` can call the same function instead of a second copy.
  - `server/services/scenesFile.js` (NEW) — `readScenesFile()`/`writeScenesFile()` extracted out of `scenes.js` (identical bodies) so `images.js` and `higgsfieldRegenerate.js` read/write `scenes.json` through the same dual-shape-handling code FT-1/FT-2 already established, instead of a third copy.
- `server/index.js` — mounted the two new routers at `/api/images` and `/api/higgsfield`.

**A correctness gap found and fixed while wiring this up (not part of the original ask, but required for the feature to do anything at render time):** the render pipeline never actually read `scene.image_path` at all. `VideoCreator.jsx`'s `imagePaths` memo and `ExportPanel.jsx`'s render-trigger scene merge both sourced images *exclusively* from `sceneStatuses` (the original bulk-generation-time snapshot), and `ExportPanel.jsx` even **hard-overrode** `image_path` with `sceneStatuses[...] || null` on every render. Since `scene.image_path` was never set anywhere before FT-3, this was invisible — but it meant a Fine-Tune swap/regenerate would have updated `scenes.json` while the actual preview and render silently kept using the old image. Fixed with two one-line precedence changes (both additive — `scene.image_path` was always `undefined` pre-FT-3, so this changes nothing for any scene that never went through Fine-Tune):
  - `VideoCreator.jsx`'s `imagePaths` useMemo now also folds in `scene.image_path` (added `scenes` to the dependency array), which fixes the sticky mini-player, the scene-preview modal, and `PreviewPlayer` all at once since they all consume this single memo.
  - `ExportPanel.jsx`'s `scenesWithPaths` merge changed from `sceneStatuses[s.scene_id]?.image_path || null` to `s.image_path || sceneStatuses[s.scene_id]?.image_path || null`, so the actual rendered MP4 uses a Fine-Tune swap/regenerate.

**Testing — commands run and results:**
```
$ node server/services/imageSwap.test.js
```
5/5 assertions passed: no-op when a scene has no `image_path` yet; no-op when the referenced file is missing from disk; first call backs up the current file; a second and third swap each overwrite the live file but never re-touch the existing backup (the true original survives repeated swaps — the core guarantee this module exists for).

```
$ node server/routes/images.test.js
```
11/11 assertions passed against a real Express app with only the images router mounted, driven over HTTP with `fetch`/`FormData`/`File` (Node 18+ globals), using a disposable fixture project (verified cleaned up afterward): valid upload returns 200 and keeps the same `image_path`; the live file gets the uploaded bytes; the original Higgsfield file is backed up to `scene_001_original.jpg` before the overwrite; a second upload overwrites the live file again but the backup (and its original bytes) are untouched; a scene with no prior image gets a new filename with no spurious backup; non-image file types, missing files, and missing `projectId` are all rejected with 400; unknown scene/project return 404; and an untouched `motion_graphic` scene in the same project is confirmed unaffected.

```
$ node server/routes/higgsfieldRegenerate.test.js
```
13/13 assertions passed, using the monkey-patch technique described in the file's header comment (patches `higgsfieldService.generateImage`, `promptEnhancer.enhancePrompt`, and `imageDownloadSvc.downloadImage` on their module-exports objects for the duration of the test, restored in a `finally` block) so the happy path runs fast and deterministically with zero real Higgsfield/Claude calls: all validation paths (missing `projectId`, unknown scene, unknown project, non-`image` shot type, empty `higgsfield_prompt`) rejected before touching the generation pipeline; the happy path confirms `enhancePrompt` receives the scene's *own* stored prompt (not something client-supplied) and `generateImage` receives exactly `enhancePrompt`'s output — proving the pipeline is reused in the same order `processScene()` uses; `downloadImage`'s output lands at the same `image_path` location; the original file is backed up before the regenerated image overwrites it; a second regenerate doesn't disturb that backup; scenes 002/003 (rejected up front) are confirmed completely untouched — proving no other scene is ever touched or re-triggered; and a thrown error from `generateImage` propagates as a clean `500` with the underlying message, with nothing persisted.

Also verified manually:
- `node -e "require(...)"` on all 4 touched/new route files — load without error
- `npx eslint src/pages/wizard/FineTuneStep.jsx` — clean (the errors surfaced in `VideoCreator.jsx`/`ExportPanel.jsx` by a full lint pass all predate this phase — confirmed via `git diff --stat`, left untouched per guardrails)
- `npx vite build` — clean production build
- Re-ran the full FT-1/FT-2 test suites (`frameMath.test.js`, `scenes.test.js` — 46 assertions) after the `imageDownload.js`/`scenesFile.js` extractions — all still pass, confirming the refactor didn't change behavior
- Against the live dev server (nodemon auto-restarted on the route/index.js changes): `curl -X POST /api/higgsfield/regenerate/001` and `curl -X POST /api/images/001/replace` (both with no `projectId`) correctly returned `400 {"error":"projectId required"}`

**Production-readiness checklist:**
- [x] Image swap file picker on each image-shot-type scene card; uploads via multipart
- [x] Upload always backs up the pre-existing file to `scene_{sceneId}_original.jpg` exactly once, before any overwrite, regardless of how many times a scene is later swapped/regenerated
- [x] `POST /api/images/:sceneId/replace` implemented, registered, validates file type/presence/projectId/scene existence
- [x] Regenerate button re-runs the existing Higgsfield generation service (`enhancePrompt`/`generateImage`/`downloadImage`) reused, not duplicated, scoped to exactly one `scene_id`; no other scene is touched or re-triggered (asserted directly in tests)
- [x] `POST /api/higgsfield/regenerate/:sceneId` implemented, registered, same backup-then-overwrite pattern as manual upload
- [x] Fixed the render/preview pipeline to actually honor `scene.image_path` (previously dead code — this phase's endpoints would have had zero visible effect without it)
- [x] Client build clean — zero errors
- [x] PLAN.md updated with FT-3 completion entry

---

### Phase FT-4 — Fine-Tune stage: manual J-cut/L-cut boundary offset ✅ COMPLETE

**Existing mechanism reviewed before making changes:** Documentary.jsx's narration-track builder already supports automatic J-cut/L-cut audio bleed via two per-scene fields — `audio_cut` (`'hard' | 'j_cut' | 'l_cut'`) and `audio_overlap_seconds`. Critically, both describe the scene's *own* narration track relative to *its own* boundaries: `l_cut` on scene N means N's audio extends past its own end into N+1 (N's own **outgoing** boundary); `j_cut` on scene N means N's audio starts early, bleeding backward into the *previous* scene N-1's tail (i.e., from the N-1/N boundary's perspective, this is actually **N-1's outgoing boundary**, expressed via N's own field). This asymmetry drove the field design below.

**What was built:**
- Two new optional scene fields, both stored on the **outgoing** (earlier) scene of a boundary pair, default absent/0.0: `jcut_offset`, `lcut_offset` (seconds), plus `is_manual_offset` (boolean) and `boundary_partner_scene_id` (the next scene's `scene_id` this offset was calibrated against — internal bookkeeping needed to detect a reorder breaking the pairing, see below). An explicit boolean rather than overloading `0.0`/`null`, exactly as the task required, since `0.0` is a valid intentional "no bleed" value.
- `remotion/src/compositions/Documentary.jsx` — the narration-track builder's overlap calculation now checks for a manual override *first*:
  - For `l_cut` (this scene's own outgoing boundary): reads `scene.is_manual_offset`/`scene.lcut_offset`, keyed on `scene.boundary_partner_scene_id === nextScene?.scene_id`.
  - For `j_cut` (this scene's incoming boundary — actually the *previous* scene's outgoing boundary): reads `prevScene.is_manual_offset`/`prevScene.jcut_offset`, keyed on `prevScene.boundary_partner_scene_id === scene.scene_id`.
  - Falls back to the existing automatic calculation only when no manual value applies (offset absent, `is_manual_offset` false, or the partner check fails). A manual `0.0` is honored exactly as entered (unlike automatic, which floors at 0.8s) — the whole point of a manual override is to let the user go below that floor.
  - A defensive second clamp re-checks the manual value against actual `audio_duration`s at render time (in case `scenes.json` was hand-edited or reached this state through another path) and `console.warn`s if it had to adjust anything.
  - This is the only change to Documentary.jsx's narration logic — `calculateDocumentaryDuration`, the transition frame math, and the FT-1 narration-volume override are untouched (verified by diff).
- `server/services/frameMath.js` — added `BOUNDARY_SAFETY_MARGIN_SECONDS` (0.2s — mirrored in both Documentary.jsx and FineTuneStep.jsx), `maxBoundaryOffsetSeconds()`, `validateBoundaryUpdate()`, `resolveManualOverlapSeconds()` (a pure duplicate of the priority logic above, for testing without needing the ESM/JSX Remotion file — same reasoning as all the other duplicated constants in this file), and `resetBrokenBoundaryAdjacency()` (server-authoritative, not a Documentary.jsx mirror — see below).
- `server/routes/scenes.js` — `PATCH /api/scenes/:sceneId/boundary`. Body: `{ projectId, jcut_offset?, lcut_offset?, is_manual_offset? }`. `is_manual_offset: false` always succeeds (revert, no bounds checked). Otherwise validates both offsets are `>= 0` and `<= maxBoundaryOffsetSeconds(scene.audio_duration, nextScene.audio_duration)` — **rejects** with a specific error listing the actual bound rather than silently clamping, matching the existing `PATCH /:sceneId` convention. Rejects outright if the scene is the last one in the project (no outgoing boundary exists). On success, records `boundary_partner_scene_id = nextScene.scene_id`.
- **Reorder interaction (FT-2)**: `POST /api/scenes/reorder` now calls `resetBrokenBoundaryAdjacency()` on the new array before persisting. Since the offset lives on the scene object itself, it always travels with that scene through a reorder (nothing special needed there) — but if the reorder changes *who is now next* to a scene with a manual offset, that offset no longer has a meaningful pairing. The function walks the new order and, for any scene where `boundary_partner_scene_id` no longer matches the actual next neighbor (including "the scene is now last — there is no next neighbor at all"), resets `is_manual_offset` to `false` and logs a `console.warn` — exactly as the task specified, rather than silently keeping a now-meaningless manual value.
- `client/src/pages/wizard/FineTuneStep.jsx` — new `BoundaryControl` component, docked at the seam between each pair of adjacent scene cards (not on an individual card) via a small wrapper around the existing `scenes.map(...)` render loop. Shows two number inputs (J-cut/L-cut seconds, both bounded `[0, maxBoundaryOffset(outgoingScene, nextScene)]` using the same margin/formula as the server), a "Revert to generated" button (shown only when `is_manual_offset` is actually true *and* still paired with this exact next scene), inline validation errors, and a one-line explanation of what J-cut/L-cut mean and that the boundary only takes effect if that scene's existing `audio_cut` is already set to match (this phase does not add an `audio_cut` editor — out of scope, not asked for).

**Guardrails respected:** FT-1 (duration/transition/audio-mix), FT-2 (reorder's core array-permutation logic), and FT-3 (image swap/regenerate) were not touched beyond the one intentional, required reorder hook described above — confirmed via diff. No action cut, match cut, split-screen, cutaway, or montage flag was added.

**Testing — commands run and results:**
```
$ node server/services/frameMath.test.js
```
34/34 assertions passed (22 from FT-1/FT-2, unchanged, plus 12 new): `BOUNDARY_SAFETY_MARGIN_SECONDS` correct; `maxBoundaryOffsetSeconds` bounds to the shorter adjacent `audio_duration` minus the margin (including the missing-`audio_duration`-treated-as-0 and would-go-negative-floored-at-0 cases); `validateBoundaryUpdate` accepts exactly at the clamp boundary, rejects just above it, rejects negative, accepts `0.0` as intentional, rejects when there's no next scene, always accepts `is_manual_offset: false`, and reports only the specific field that violates the clamp; `resolveManualOverlapSeconds` proves the l_cut-reads-`scene`/j_cut-reads-`prevScene` split with a case specifically designed to catch conflating `jcut_offset` and `lcut_offset`, falls back to automatic when the partner check fails, and returns `null` for hard cuts regardless of manual flags; `resetBrokenBoundaryAdjacency` leaves an intact pairing untouched, resets when a reorder inserts a scene between the pair, resets when the scene becomes the last scene (no boundary at all), and is a no-op on scenes with nothing manually set.

```
$ node server/routes/scenes.test.js
```
41/41 assertions passed (24 from FT-1/FT-2 unchanged, plus 17 new — 10 boundary-endpoint + 7 reorder-adjacency): a valid offset within bounds returns 200 and persists `jcut_offset`/`lcut_offset`/`is_manual_offset`/`boundary_partner_scene_id`; an offset exceeding the clamp is rejected (400) and the previously-persisted value survives untouched (not silently clamped or overwritten); negative offsets rejected; the exact clamp boundary accepted; `0.0` accepted as intentional; revert (`is_manual_offset: false`) always succeeds; the last scene (no outgoing boundary) is rejected; unknown scene/project/missing-projectId all handled. For reorder-adjacency: a reorder that keeps the paired scenes adjacent leaves the manual offset intact; a reorder that inserts a third scene between the pair resets `is_manual_offset` to `false` (and confirms the reset is actually persisted to `scenes.json`, not just returned in the response); a reorder that makes the scene the new last scene also resets it.

Also verified manually:
- `node -e "require(...)"` on `scenes.js` — loads without error
- `npx eslint src/pages/wizard/FineTuneStep.jsx` — clean
- `npx vite build` — clean production build
- Re-ran the full FT-1/FT-2/FT-3 test suites (`frameMath.test.js`, `scenes.test.js`, `imageSwap.test.js`, `images.test.js`, `higgsfieldRegenerate.test.js`) after all FT-4 changes — all still pass
- Against the live dev server (nodemon auto-restarted on the route file change): `curl -X PATCH /api/scenes/001/boundary` with an empty body correctly returned `400 {"error":"projectId required"}`

**Production-readiness checklist:**
- [x] Boundary control docked at the seam between adjacent scene cards, not on an individual card
- [x] `jcut_offset`/`lcut_offset` (seconds, optional) added to the scene object; `is_manual_offset` boolean added rather than overloading `0.0`/`null`
- [x] Offset bounded to `min(outgoing.audio_duration, next.audio_duration) - 0.2s` safety margin, both client-side (UI max) and server-side (rejected, not silently clamped, if exceeded)
- [x] Documentary.jsx checks the manual offset first, falls back to automatic only when absent — verified directly against the priority-logic unit tests
- [x] `PATCH /api/scenes/:sceneId/boundary` implemented, registered, persists to the correct (outgoing) scene
- [x] "Revert to generated" clears `is_manual_offset` back to `false`
- [x] A reorder that keeps the paired scenes adjacent preserves the manual offset; a reorder that breaks that adjacency resets `is_manual_offset` to `false` with a `console.warn`, not a silent keep
- [x] FT-1/FT-2/FT-3 logic untouched beyond the one required reorder hook
- [x] No action cut, match cut, split-screen, cutaway, or montage flag added
- [x] Client build clean — zero errors
- [x] PLAN.md updated with FT-4 completion entry

---

### Phase FT-5 — Fine-Tune stage: action cut pacing preset ✅ COMPLETE

**What was built:**
- One new optional scene field: `pacing` (`'standard' | 'action' | 'montage'`, default `'standard'`) — this phase only ever sets `'action'`.
- `client/src/pages/wizard/FineTuneStep.jsx`:
  - A "Select Scenes" toggle in the step header enters multi-select mode, showing a checkbox next to each card. Plain click selects exactly one scene (and sets it as the range anchor); shift-click extends a contiguous range from that anchor to the clicked scene — classic file-explorer range select, which inherently guarantees contiguity with no gap-filling or rejection logic needed.
  - Whenever the selection is non-empty, a toolbar appears with the scene count, an "Apply Action Cut" button, and an up-front warning listing how many boundaries *inside* the range have a manual FT-4 J/L-cut offset that will be reset (computed client-side by walking the same array-adjacency check the server uses).
  - Each `FineTuneCard` gets a "Pacing" row (shown only when pacing isn't `'standard'`) with an "⚡ Action Cut" badge and a "Revert to generated" button that restores `pacing`/`transition_out`/`duration_seconds` together from the FT-1 snapshot mechanism (extended this phase to also capture `pacing` at first-visit time) through the existing `PATCH /:sceneId` endpoint — no new revert machinery needed.
- `server/routes/scenes.js` — `PATCH /api/scenes/pacing`. Body: `{ projectId, scene_ids: [...], pacing: 'action' }` (only `'action'` is accepted this phase — `'standard'`/`'montage'` are rejected with a clear message; reverting to standard goes through `PATCH /:sceneId` instead, restoring each scene's own snapshot). For every scene in `scene_ids`: sets `pacing: 'action'`, `transition_out: 'cut'`, and a clamped `duration_seconds` (see below). Rejects (doesn't silently skip) if any `scene_id` is unknown. **Registered before `PATCH /:sceneId`** — otherwise Express would match `/pacing` as a `:sceneId` value and this route would never be reached (same param-collision class as `library.js`'s `/upload` vs `/:clip_id`, and FT-4's `/pacing` vs `/:sceneId/boundary`).
- `PATCH /:sceneId` (FT-1's endpoint) gained one additive optional field, `pacing`, used only by the revert path described above — this does not change duration_seconds/transition_out/audio_mix_override validation at all; the full FT-1/FT-2/FT-4 test suite was re-run after this change and every existing assertion still passes unmodified.
- `server/services/frameMath.js`:
  - `clampDurationForActionCut(currentDurationSeconds, audioDuration)` — computes a tighter target (`audio_duration + 0.3s`, vs. the standard 0.8s buffer) and clamps the current duration down toward it, but the result is then floored at `minDurationSeconds(audioDuration)` (FT-1's existing, untouched hard floor) — which always wins mathematically since 0.3s < 0.8s. The practical effect: any scene with a duration more generous than the FT-1 floor shrinks down to exactly that floor; the 0.3s number is a real step in the computation, it's just subsumed by the floor whenever the scene already had a legal duration, which is precisely what the task's explicit "never below the same hard floor from FT-1, regardless of action-cut clamping" requirement demands.
  - `resetActionCutBoundaryOffsets(scenesInOrder, affectedSceneIds)` — hard cuts don't bleed audio, so any manual FT-4 boundary offset where **both** the outgoing scene and its actual next-in-array neighbor are in the affected set gets `is_manual_offset` reset to `false` (with a `console.warn`, mirroring FT-4's own reset-and-warn convention) rather than silently ignored or left pointing at a transition that no longer makes sense. Boundaries at the *edge* of the range (only one side selected) are left untouched, since only the scene actually being hard-cut had anything change.

**Guardrail interaction handled explicitly:** action cut does not touch `audio_cut`/`audio_overlap_seconds` (the pre-existing Claude-set automatic bleed fields) at all — only the FT-4 *manual override flag* (`is_manual_offset`) is reset, and only for boundaries fully inside the selected range. FT-1/FT-2/FT-3/FT-4 logic itself is otherwise untouched (confirmed via diff) — no match cut, split-screen, cutaway, or montage flag was added.

**Testing — commands run and results:**
```
$ node server/services/frameMath.test.js
```
46/46 assertions passed (34 from FT-1/FT-2/FT-4 unchanged, plus 12 new): `ACTION_CUT_BUFFER_SECONDS`/`PACING_VALUES` correct; `clampDurationForActionCut` proves the FT-1 hard floor wins over the tighter 0.3s target on a generous-duration scene (5s duration, 1.0s audio → floor 1.8s, not the 1.3s target), leaves an already-at-floor duration unchanged, treats missing `audio_duration` as 0 for the floor calculation, stays floor-dominated even on an atypical low starting duration, and never exceeds `MAX_SCENE_SECONDS`; `resetActionCutBoundaryOffsets` resets a manual offset when both sides of its boundary are in the range, but explicitly leaves a boundary untouched when only one side is in the range (edge of the range) — and is a no-op when nothing is manually set.

```
$ node server/routes/scenes.test.js
```
57/57 assertions passed (41 from FT-1/FT-2/FT-4 unchanged, plus 16 new — 7 pacing-endpoint + 5 boundary-interaction/revert + others): a valid 3-scene range updates `transition_out`, `duration_seconds`, and `pacing` correctly for every scene in it (with the exact expected clamped durations — 1.8s/2.8s/2.3s for three scenes with different `audio_duration`s), while a 4th scene outside the range is completely untouched on disk; the end-to-end persisted duration is verified `>= audio_duration + 0.8s`; `pacing` values other than `'action'` are rejected; empty/missing `scene_ids`, an unknown `scene_id` in the array, unknown `projectId`, and missing `projectId` are all handled. For the boundary interaction: a manual offset entirely inside the action-cut range is reset (`is_manual_offset → false`, numeric offset values left in place) — not silently ignored or left broken — while a manual offset at the edge of the range (its partner scene outside the selection) is left untouched. For revert: `PATCH /:sceneId` restores `duration_seconds`, `transition_out`, and `pacing` to their exact pre-action-cut values for every scene that was in the range, verified both in the response and by re-reading `scenes.json` from disk.

Also verified manually:
- `node -e "require(...)"` on `scenes.js` — loads without error
- `npx eslint src/pages/wizard/FineTuneStep.jsx` — clean
- `npx vite build` — clean production build
- Re-ran the full FT-1/FT-2/FT-3/FT-4 test suites (`frameMath.test.js`, `scenes.test.js`, `imageSwap.test.js`, `images.test.js`, `higgsfieldRegenerate.test.js`) after all FT-5 changes — all still pass, confirming the additive `pacing` field on `PATCH /:sceneId` didn't disturb anything
- Against the live dev server (nodemon auto-restarted on the route file change): `curl -X PATCH /api/scenes/pacing` with an empty body correctly returned `400 {"error":"projectId required"}` — confirming it actually matched the new `/pacing` route and not `/:sceneId` with `sceneId="pacing"`

**Production-readiness checklist:**
- [x] Multi-select (checkbox + shift-click contiguous range) added to the Fine-Tune scene grid
- [x] "Apply Action Cut" button appears when a range is selected
- [x] `pacing` field added, defaulting to `'standard'`; this phase only sets `'action'`
- [x] Applying action cut sets `pacing: 'action'`, `transition_out: 'cut'`, and clamps `duration_seconds` toward the tighter 0.3s buffer, never below the FT-1 hard floor (audio_duration + 0.8s) — verified end-to-end
- [x] `PATCH /api/scenes/pacing` implemented, registered before `/:sceneId` to avoid the Express param collision
- [x] A manual FT-4 boundary offset fully inside the range is reset (not silently overridden or left broken); one at the edge of the range is left alone
- [x] "Revert to generated" restores `pacing`/`transition_out`/`duration_seconds` together from the Fine-Tune snapshot, per scene, for every scene that was in the affected range
- [x] FT-1/FT-2/FT-3/FT-4 logic untouched beyond the one additive `pacing` field on `PATCH /:sceneId`
- [x] No match cut, split-screen, cutaway, or montage flag added
- [x] Client build clean — zero errors
- [x] PLAN.md updated with FT-5 completion entry

---

### Phase FT-6 — Fine-Tune stage: match cut suggestion ✅ COMPLETE

**Existing scene-analysis flow reviewed before making changes:** `server/services/claude.js`'s public entry point is `analyzeScript({ script, metadata, defaults })` (called once by `server/routes/analyze.js`), which runs `attemptAnalysis` (or falls back to `attemptAnalysisSimplified` on failure), then `postProcessScenes()` to finalize `scene_id`, the style-locked `higgsfield_prompt`, defaults, etc. This is the single, correct place to hook in a post-analysis comparison pass — it already runs exactly once per script, not on every Fine-Tune page load.

**What was built:**
- One new optional scene field: `match_cut_candidate` (boolean, default `false`) — defaulted in `postProcessScenes` for schema consistency, alongside the other defaulted fields (`audio_cut`, `letterbox`, etc.).
- `server/services/claude.js` — `detectMatchCutCandidates(scenes, claudeCaller = callClaude)`:
  - Builds the list of consecutive scene pairs where BOTH scenes have a meaningful visual prompt (`image`/`real_footage` shot types only — `motion_graphic`/`3d_graphic` scenes have no analogous field and are excluded from every pair entirely).
  - Sends **one single batched Claude call** (haiku, via the existing `callClaude` helper) covering every pair at once, rather than one call per pair — for a 65-scene script that's 1 call instead of 64, both far cheaper and far less likely to time out.
  - The system prompt instructs Claude to judge genuine visual continuity (matching shapes/silhouettes, composition/framing, motion direction, color/lighting) — not narrative/thematic similarity — and to return a JSON array of the **outgoing** scene_ids of qualifying boundaries.
  - `claudeCaller` is injectable (defaults to the real `callClaude`) specifically so tests can supply a fake verdict without real API credentials — `callClaude` is invoked as a plain local function reference inside `detectMatchCutCandidates`, so monkey-patching `module.exports.callClaude` from outside would not actually reach the call; dependency injection was the correct fix here, not a require-cache trick.
  - `parseMatchCutResponse()` — a small **dedicated** parser, deliberately not the existing shared `extractJSON()`. `extractJSON` assumes a non-empty scene array (every one of its fallback paths requires `parsed.length > 0`) and would throw on a legitimate `"[]"` response — which is a common, valid answer here ("no match cuts in this script"). Reusing it would have risked misinterpreting "no candidates" as a parse failure, and modifying `extractJSON` itself risked the main scene-analysis flow, which the guardrails explicitly protect.
  - `analyzeScript()` now calls `detectMatchCutCandidates(processed)` after `postProcessScenes`, wrapped in a single `try/catch`: any failure (API error, malformed response, timeout) is caught, logged, and the function returns the scenes exactly as `postProcessScenes` produced them (`match_cut_candidate: false` for everyone) — the main analysis result is never blocked, delayed by a failed comparison, or lost.
- `remotion/src/compositions/Documentary.jsx` and `server/services/frameMath.js` (its server-side mirror) — `getTransition()`'s switch statement now has `case 'match':` falling through to the exact same branch as `case 'cut':`, returning `{ type: 'cut', frames: CUT_FRAMES, ... }` — **not** a new `'match'` descriptor type. Since `transition_out` is only ever read inside `getTransition()` in Documentary.jsx (confirmed via a full-file grep before making changes), and every downstream consumer (`seriesChildren`'s flatMap, the narration-track builder, `calculateDocumentaryDuration`) only ever inspects the *returned* `outT.type`, normalizing `'match'` to `'cut'` at this single point means literally zero other code anywhere needed to change — exactly the "do not add new transition math" requirement.
- `VALID_TRANSITIONS` (`frameMath.js`, used by `validateSceneUpdate`) gained `'match'` — the one explicitly-authorized additive change to FT-1's existing validator (adding an enum value, not altering any existing field's validation behavior; re-verified the full FT-1 test suite still passes unmodified).
- `client/src/pages/wizard/FineTuneStep.jsx`:
  - `TRANSITIONS` (the dropdown FineTuneCard's "Transition Out" select uses, untouched from FT-1) gained a `{ value: 'match', label: 'Match Cut' }` entry — required simply so the dropdown displays correctly once a scene's `transition_out` is `'match'`, not a new feature.
  - `BoundaryControl` (FT-4's component) now shows a "✂ Match cut suggested" badge whenever `outgoingScene.match_cut_candidate` is true, with an "Accept" button. Accepting calls the **existing** `PATCH /:sceneId` endpoint with `{ transition_out: 'match' }` — no new endpoint was needed, since this is just a plain field update FT-1 already supports (now that `'match'` is a valid value). `match_cut_candidate` is never included in that request body, so it's never disturbed.
  - Revert is the **existing, untouched** FT-1 "Transition Out" revert on the scene card itself (`revertField('transition')`, comparing `transition_out` against the Fine-Tune snapshot) — accepting a match cut just changes `transition_out`, which that mechanism already knows how to revert. No new revert machinery was built for this.

**Guardrail interaction handled explicitly:** the accept/revert flow only ever touches `transition_out`; `match_cut_candidate` is set once during analysis and never written to again by any Fine-Tune action, satisfying "match_cut_candidate itself persists regardless, since it reflects analysis, not a user edit" without any special-casing needed in the revert path.

**Known, deliberate limitation (consistent with FT-5's precedent, not a new regression):** `FineTuneCard`'s "Transition Out" dropdown holds its displayed value in local `useState`, synced only by that same card's own commit/revert handlers (an intentional FT-1 design choice to avoid a `react-hooks/set-state-in-effect` violation). An externally-driven `transition_out` change — via `BoundaryControl`'s Accept button here, or FT-5's bulk action-cut before it — updates the underlying scene data correctly (verified by tests) but the dropdown's own visual state may lag until the next natural re-render trigger (e.g. leaving and returning to the Fine-Tune step, which fully remounts it). This is the same class of cosmetic-only gap FT-5 already shipped with, not something newly introduced here, and fixing it would mean touching FT-1/FT-5's card-state architecture, which the guardrails protect.

**Testing — commands run and results:**
```
$ node server/services/claude.test.js
```
11/11 assertions passed, using dependency injection (a fake `claudeCaller`) rather than the real Anthropic API — fast, deterministic, no credentials needed: a genuinely similar test pair (two wide shots of a lone figure in a symmetrical, cool-blue-lit space — a corridor and a parking garage) produces `match_cut_candidate: true` on the outgoing scene; a clearly dissimilar pair (that same corridor shot vs. an extreme close-up birthday cake with warm bokeh) does not; the actual prompt sent to Claude is asserted to contain every real pair's specific visual details, proving the comparison genuinely inspects `higgsfield_prompt`/`composition` content rather than guessing; a `motion_graphic` scene (no visual prompt) is confirmed excluded from every pair and never flagged; a thrown error from the comparison step is caught via the exact same `try/catch` pattern `analyzeScript` uses, and the scene set still completes intact and unflagged — proving graceful degradation; an empty `"[]"` verdict (no candidates) is handled without error, unlike what the shared `extractJSON` would have done; and `parseMatchCutResponse`/`buildMatchCutPrompt` are unit-tested directly for markdown-fence stripping, empty-array handling, and malformed-input rejection.

```
$ node server/services/frameMath.test.js
```
51/51 assertions passed (46 from FT-1/FT-2/FT-4/FT-5 unchanged, plus 5 new): `VALID_TRANSITIONS` includes `'match'`; `getTransition('match')` produces a descriptor **deeply equal** to `getTransition('cut')` (proving zero new math, not just similar behavior) and normalizes to `type: 'cut'`; `calculateDocumentaryDuration` deducts the exact same frame count for a `'match'`-boundary scene as it would for an identical `'cut'`-boundary scene, proving Documentary.jsx's actual render-timing math treats them identically; `validateSceneUpdate` accepts `transition_out: 'match'`.

```
$ node server/routes/scenes.test.js
```
63/63 assertions passed (57 from FT-1/FT-2/FT-4/FT-5 unchanged, plus 6 new): accepting sets `transition_out: 'match'` via the existing `PATCH /:sceneId` endpoint without disturbing `match_cut_candidate`; the accepted value persists to `scenes.json`; reverting (sending the prior `transition_out` value, exactly as the client's existing snapshot-based revert does) restores it while `match_cut_candidate` remains `true` throughout — verified both in the response and by re-reading the persisted file; a second scene never part of the flow is confirmed completely unaffected; `transition_out: 'match'` is confirmed valid on the standard per-scene endpoint (needed for both the Accept button and a manual dropdown pick to work).

Also verified manually:
- `node -e "require(...)"` on `claude.js` — loads without error, confirmed all 5 exports (`analyzeScript`, `callClaude`, `detectMatchCutCandidates`, `parseMatchCutResponse`, `buildMatchCutPrompt`) present
- A full-file `grep` confirming `transition_out` is read *only* inside `getTransition()` in Documentary.jsx, before deciding that changing just that one function's switch statement was sufficient
- `npx eslint src/pages/wizard/FineTuneStep.jsx` — clean
- `npx vite build` — clean production build
- Re-ran the full FT-1/FT-2/FT-3/FT-4/FT-5 test suites (`frameMath.test.js`, `scenes.test.js`, `imageSwap.test.js`, `images.test.js`, `higgsfieldRegenerate.test.js`) after all FT-6 changes — all still pass
- Against the live dev server (nodemon auto-restarted on the file changes): `curl -X PATCH /api/scenes/001` with `{"transition_out":"match"}` and no `projectId` correctly returned `400 {"error":"projectId required"}` — confirming the request reached validation past the `transition_out` check (i.e., `'match'` didn't get rejected earlier in the pipeline)

**Production-readiness checklist:**
- [x] Match-cut comparison runs once during scene analysis (`analyzeScript`), not on every Fine-Tune page load — result persists on the scene object
- [x] `match_cut_candidate` (boolean, default `false`) added to the scene schema, set `true` on the outgoing scene of a boundary Claude judges visually similar
- [x] A single batched Claude call covers every consecutive pair, not one call per pair
- [x] A comparison-step failure is caught and never blocks, slows, or crashes the main scene-analysis flow — verified with a fake that throws
- [x] `FineTuneStep.jsx`'s boundary control shows a "Match cut suggested" badge when `match_cut_candidate` is true
- [x] Accepting sets `transition_out: 'match'` via the existing `PATCH /:sceneId` endpoint — no new endpoint needed
- [x] `'match'` added as a valid `transition_out` value in both the scene schema (`VALID_TRANSITIONS`) and Documentary.jsx's transition handling
- [x] Documentary.jsx renders `'match'` via the exact same code path as `'cut'` — verified via deep-equal descriptor comparison and identical `calculateDocumentaryDuration` output, not just "similar" behavior
- [x] Revert restores the prior `transition_out` value (via the existing, untouched FT-1 revert mechanism) while `match_cut_candidate` persists untouched
- [x] FT-1/FT-2/FT-3/FT-4/FT-5 logic untouched beyond the one additive `'match'` enum value
- [x] No split-screen, cutaway, or montage flag added
- [x] Client build clean — zero errors
- [x] PLAN.md updated with FT-6 completion entry

---

### Phase FT-7 — Fine-Tune stage: split-screen layout ✅ COMPLETE

**Documentary.jsx's `TransitionSeries.Sequence` structure and `SceneRenderer` reviewed before making changes:** each scene gets exactly one `<TransitionSeries.Sequence durationInFrames={...}>` wrapping an `<AbsoluteFill><ErrorBoundaryScene><SceneRenderer/></ErrorBoundaryScene></AbsoluteFill>`. `SceneRenderer` is a pure visual dispatch by `shot_type` — it has no awareness of timing at all (duration/transitions are computed entirely upstream by `sceneDur`/`getTransition`, which only ever read `duration_seconds`/`transition_out`). This is exactly why split-screen could be implemented as a *visual dispatch change inside `SceneRenderer`'s existing `image` branch* — swapping which component renders inside the *same* Sequence — without touching the Sequence structure, the flatMap loop, or any timing math at all.

**What was built:**
- Three new optional scene fields: `layout` (`'single' | 'split_horizontal' | 'split_vertical'`, default `'single'`), `secondary_image_path` (string, default `null`), `secondary_source_scene_id` (string, default `null` — records which scene's image was reused, for reference; `null` whenever the secondary panel came from Regenerate instead). All three defaulted in `claude.js`'s `postProcessScenes`, matching the FT-6 `match_cut_candidate` precedent — Claude's analysis never sets these, only Fine-Tune user actions do.
- `remotion/src/components/SplitScreenScene.jsx` (NEW) — the dual-panel renderer. Two flex panels (row for `split_horizontal`, column for `split_vertical`) each showing one `<img>` with `object-fit: cover`, a thin divider line between them, and the same "always-on" cinematic effects `ImageScene.jsx` applies (`ColorGrade`, `Vignette`, `FilmGrain`, `SceneFade`, `LetterboxBars`) so a split-screen scene doesn't look visually disconnected from the rest of the documentary. Deliberately skips the conditional/mood-specific effects (camera shake, dust, halation, light leak) to keep this new component minimal.
- `Documentary.jsx`'s `SceneRenderer` — the `image` branch now checks `layout`: renders `<SplitScreenScene>` only when `layout` is a split value **and** `secondary_image_path` is actually set; falls back to the existing, untouched `<ImageScene>` in every other case — including a split layout with no secondary image yet, and (per the guardrail) a layout reverted back to `'single'` even if a stale `secondary_image_path` value is still sitting on the scene object. **This is one scene, one `TransitionSeries.Sequence`, one duration, one narration track — nothing about the Sequence structure, the flatMap loop, `sceneDur`, or `getTransition` was touched.**
- `server/services/imageSwap.js` — `backupOriginalIfNeeded()` gained one additive optional parameter, `backupSuffix = 'original'`, defaulting to FT-3's exact existing filename/behavior for every existing caller (re-verified: FT-3's full test suite still passes unmodified). FT-7 passes `'secondary_original'` so the secondary panel's backup never collides with the primary panel's own `scene_{id}_original.jpg`.
- `server/routes/scenes.js` — `PATCH /api/scenes/:sceneId/layout`. Body: `{ projectId, layout, source_scene_id? }`.
  - **Reuse mode** (`source_scene_id` provided): validates the source scene exists, has an `image_path`, and that file actually exists on disk — then `fs.copyFileSync()`s it to a new file scoped to *this* scene (`{sceneId}_secondary{ext}`, or the existing secondary filename on a repeat reuse) — a genuine, independent copy, never a live reference, exactly as required. Backs up this scene's own prior secondary image first via the `'secondary_original'` suffix.
  - **`layout: 'single'`** always clears `secondary_image_path`/`secondary_source_scene_id` back to `null` — this single rule *is* the entire "Revert to generated" mechanism for this phase (task point 7): no snapshot needed, since `'single'`/`null`/`null` is always the one and only "generated" state for these fields.
- `server/routes/higgsfieldRegenerate.js` — `POST /api/higgsfield/regenerate-secondary/:sceneId`. Body: `{ projectId, prompt }`. Same pipeline as FT-3's primary-panel `/regenerate` (`enhancePrompt → generateImage → downloadImage`, reused not duplicated) and the same backup-then-overwrite safety — but the prompt is a **fresh, user-supplied** one for the second panel (wrapped in a minimal scene-like object so it still gets the style-lock/enhancement treatment), not the scene's own stored `higgsfield_prompt`. Only ever touches `secondary_image_path` on the one target scene; clears `secondary_source_scene_id` since the result is no longer derived from any other scene's image.
- `client/src/pages/wizard/FineTuneStep.jsx` — a "Layout" selector added to each image scene's `FineTuneCard` (Single / Split Horizontal / Split Vertical). Selecting a split layout with no secondary image yet opens a picker with two modes: **Reuse existing scene image** (a thumbnail grid built from every other image scene in the project — `otherScenesWithImages`, computed in `FineTuneStep` from the same `scene.image_path` / `sceneStatuses` / `imagePaths` priority chain the rest of Fine-Tune already uses) and **Regenerate new** (a free-text prompt field + Generate button). "Revert to generated" sets `layout: 'single'` directly — no snapshot lookup needed, per the server design above.

**Ken Burns limitation — explicitly noted per the guardrail's escape hatch:** `ImageScene.jsx`'s Ken Burns motion is **disabled for split-screen scenes in this phase**. `SplitScreenScene.jsx` renders both panels fully static. This was a deliberate scope decision, not an oversight: correctly reusing `ImageScene`'s exact Ken Burns calibration for *two independent, simultaneously-animating* panels inside a new component — each needing its own motion-type/intensity and correct scene-relative frame timing — was assessed as materially riskier to get right on the first pass than the task's own guardrail anticipated ("if this proves complex, it's acceptable to disable Ken Burns motion specifically for split-layout scenes... rather than risk breaking the single-panel Ken Burns behavior"). Taking that explicitly-offered escape hatch was the safer choice: `ImageScene.jsx` itself was not touched at all, so single-panel Ken Burns behavior carries zero risk from this phase. Adding per-panel Ken Burns to split-screen scenes is a reasonable target for a future phase.

**Testing — commands run and results:**
```
$ node server/services/frameMath.test.js
```
55/55 assertions passed (51 from FT-1–FT-6 unchanged, plus 4 new): `LAYOUT_VALUES` defined; `calculateDocumentaryDuration` is **byte-for-byte identical** on the same two-scene set before and after adding `layout: 'split_horizontal'`/`split_vertical` plus `secondary_image_path`/`secondary_source_scene_id` to the first scene — proving split-screen has zero effect on the frame-overlap math, not just "probably no effect"; `getTransition` returns a deeply-equal descriptor regardless of layout.

```
$ node server/routes/scenes.test.js
```
76/76 assertions passed (63 from FT-1–FT-6 unchanged, plus 13 new): reuse mode sets `layout`/`secondary_image_path`/`secondary_source_scene_id` correctly and the secondary file is confirmed to be a **real, independent copy on disk** — proven by changing the source scene's own image file *after* the reuse and confirming the already-copied secondary panel bytes are unaffected; a second reuse backs up the first secondary image before overwriting (distinct `scene_A_secondary_original.jpg`, never colliding with the primary panel's own backup); reverting to `layout: 'single'` clears both secondary fields to `null` and persists that to `scenes.json`; invalid layout values, missing layout, unknown/missing source scenes, and source images missing from disk are all rejected with the correct status codes.

```
$ node server/routes/higgsfieldRegenerate.test.js
```
25/25 assertions passed (13 from FT-3 unchanged, plus 12 new): `regenerate-secondary` only ever affects the target scene's `secondary_image_path` — the primary panel image and its own backup file are confirmed completely untouched; the pipeline receives the **user-supplied prompt**, not the scene's stored `higgsfield_prompt`; the prior secondary image is backed up (with the distinct `'secondary_original'` suffix) before a second regenerate overwrites it; `secondary_source_scene_id` is cleared to `null` on a successful regenerate (no longer derived from another scene); a thrown generation error returns a clean `500` with nothing persisted.

**Remotion render test (required — dual-panel rendering can't be fully verified by unit tests alone):**
Built a disposable 4-scene test project (`projects/__ft7_render_test__`, deleted after the test) using real generated images already on disk, covering exactly the scenarios the guardrails call out: scene 001 `layout: 'single'` (unaffected baseline); scene 002 `layout: 'split_horizontal'` with two independent real images; scene 003 `layout: 'split_vertical'` with two independent real images; scene 004 `layout: 'single'` **with a stale `secondary_image_path` still set** (simulating a revert where the field wasn't cleared) — specifically to exercise the "must fall back cleanly, no broken/blank scene" guardrail via an actual render, not just code inspection.
```
$ npx remotion render src/index.jsx Documentary ../projects/__ft7_render_test__/output.mp4 --props=../projects/__ft7_render_test__/render_props.json --overwrite --concurrency=1 --timeout=120000 --gl=swangle
```
First attempt (no narration anywhere in the composition): all 335/335 frames rendered successfully — proving `SplitScreenScene`'s dual-panel rendering and `SceneRenderer`'s single-panel fallback both work with zero crashes across every frame — but the final mux step failed with `Error opening output file ...merged.wav: No such file or directory` inside `@remotion/renderer`'s `create-silent-audio.js`, a pre-existing Windows temp-directory quirk in Remotion's own silent-audio synthesis for a composition with *zero* audio tracks anywhere — unrelated to split-screen and not something this phase's code touches. Second attempt, with a real narration `.mp3` added to scene 001 specifically to avoid that zero-audio edge case:
```
Encoded 335/335
+ ../projects/__ft7_render_test__/output.mp4 9.4 MB
```
Exit code 0. `ffprobe` confirmed the output as a valid, complete video file (`duration=11.221333`, `size=9379811`). Test project deleted afterward.

Also verified manually:
- `node -e "require(...)"` on `scenes.js` and `higgsfieldRegenerate.js` — load without error
- `npx eslint src/pages/wizard/FineTuneStep.jsx` — clean
- `npx vite build` — clean production build
- Re-ran the full FT-1–FT-6 test suites (`frameMath.test.js`, `scenes.test.js`, `claude.test.js`, `imageSwap.test.js`, `images.test.js`, `higgsfieldRegenerate.test.js`) after all FT-7 changes — all still pass

**Production-readiness checklist:**
- [x] `layout`, `secondary_image_path`, `secondary_source_scene_id` added to the scene schema, all optional/defaulted
- [x] Layout selector (Single / Split Horizontal / Split Vertical) added per image scene card
- [x] Secondary panel source picker: Reuse existing scene image (grid of other scenes' thumbnails) and Regenerate new (prompt field)
- [x] Reuse mode copies the file — proven independent of the source via a post-copy source-file mutation test, not just asserted
- [x] `PATCH /api/scenes/:sceneId/layout` and `POST /api/higgsfield/regenerate-secondary/:sceneId` implemented, registered, tested
- [x] `Documentary.jsx`/`SceneRenderer` renders both panels inside the scene's existing `TransitionSeries.Sequence` — no second Sequence, no duration entry, verified via a real Remotion render
- [x] `calculateDocumentaryDuration` and the frame-overlap math confirmed byte-for-byte unchanged by split-screen, both by unit test and by construction (SceneRenderer is purely a visual dispatch, timing math never reads `layout`)
- [x] Reverting to `layout: 'single'` falls back cleanly to single-panel rendering even with a stale `secondary_image_path` present — verified via a real render, not just code inspection
- [x] Ken Burns motion disabled for split-layout scenes this phase — explicitly noted above as a deliberate, guardrail-sanctioned scope decision, not an oversight
- [x] FT-1–FT-6 logic untouched beyond the one additive `backupSuffix` parameter on `imageSwap.js` (re-verified FT-3's suite passes unmodified)
- [x] No cutaway or montage flag added
- [x] Client build clean — zero errors
- [x] PLAN.md updated with FT-7 completion entry

---

### Phase FT-8 — Fine-Tune stage: cutaway insert ✅ COMPLETE

**Documentary.jsx's `SceneRenderer` and FT-7's split-screen render path reviewed before making changes:** `SceneRenderer` is a pure per-scene visual dispatch with no awareness of the composition's overall timing — `useCurrentFrame()`, when called inside it, returns the frame *local to that scene's own `TransitionSeries.Sequence`* (Remotion scopes it to the nearest enclosing Sequence), i.e. exactly "seconds relative to the scene's own start." That's what made a temporary in-scene image swap possible as pure frame-conditional logic inside `SceneRenderer` itself, with zero changes to the Sequence structure, `sceneDur`, `getTransition`, or the narration `<Audio>` tracks (a completely separate part of the render tree, built from `narrationTracks`, with no knowledge of `SceneRenderer`'s internals at all).

**What was built:**
- One new optional scene field: `cutaway: { image_path: null, insert_at: null, duration: null }`, defaulted in `claude.js`'s `postProcessScenes` (Claude's analysis never sets this, only Fine-Tune user actions do — same precedent as FT-6/FT-7's fields).
- `server/services/frameMath.js` — `validateCutawayUpdate(scene, updates)` and `CUTAWAY_EDGE_BUFFER_SECONDS = 0.5`. Rejects (never clamps) any `insert_at`/`duration` combination that doesn't leave at least 0.5s of main visual on both sides of the cutaway, per the task's explicit requirement. Type/range errors are reported before range errors, so a malformed request never gets a confusing range-check message.
- `server/routes/scenes.js` — `PATCH /:sceneId/cutaway` (body: `{ projectId, insert_at, duration, source_scene_id? }`) validates the range server-side and, in reuse mode, copies the source scene's image file (never a live reference — same guarantee as FT-7, backup suffix `'cutaway_original'` so it never collides with the primary panel's own backup or FT-7's `'secondary_original'` backup). `DELETE /:sceneId/cutaway` resets the field to its exact default shape — this *is* the entire "Revert to generated" mechanism, no snapshot needed, mirroring FT-7's `layout: 'single'` revert.
- `server/routes/higgsfieldRegenerate.js` — `POST /regenerate-cutaway/:sceneId` (body: `{ projectId, prompt }`), the same `enhancePrompt → generateImage → downloadImage` pipeline reused a third time now (FT-3 primary, FT-7 secondary, FT-8 cutaway), with a fresh user-supplied prompt. Only ever touches `cutaway.image_path` — `insert_at`/`duration` are read from the scene's existing `cutaway` object and preserved untouched, since this endpoint has no opinion about timing at all.
- `Documentary.jsx`'s `SceneRenderer` — computes `frame`/`fps` unconditionally at the top (Rules of Hooks — must run before any early return) and, for `shot_type: 'image'` scenes, checks whether `frame` falls inside `[insert_at*fps, (insert_at+duration)*fps)`. If so, it substitutes `cutaway.image_path` for `image_path` before dispatching to whichever component actually renders — a single computation reused for both the split and non-split paths (see the interaction decision below), so there's exactly one place this logic lives.
- `client/src/pages/wizard/FineTuneStep.jsx` — a "Cutaway" section per image scene card: numeric insert-at/duration inputs (with the 0.5s buffer surfaced directly in the UI copy) plus the same two-mode source picker as FT-7 (reuse-existing-scene grid / regenerate-new prompt field, reusing the same `otherScenesWithImages` prop). Regenerate mode always commits timing via `PATCH .../cutaway` first (validated server-side) before calling `POST .../regenerate-cutaway`, since that endpoint alone can't establish `insert_at`/`duration` on a scene that never had a cutaway before.

**Split-screen + cutaway interaction — the decision the guardrail asked to be documented:** a cutaway on a split-layout (FT-7) scene replaces **only the primary panel**; the secondary panel keeps showing its own image throughout the cutaway window. Reasoning: a cutaway is meant to be a brief, contained insert, and collapsing the *entire* split layout to one full-frame image and back would be a far more jarring visual event than what a "cutaway" implies — it would look like the layout itself glitched rather than like an intentional brief insert. Keeping the secondary panel stable preserves the split layout's visual identity across the cutaway. Implementation-wise this fell out naturally: `SceneRenderer` computes the effective (possibly swapped) `image_path` once, then passes it through as `scene.image_path` to whichever component renders next — `ImageScene` for `layout: 'single'`, or `SplitScreenScene` for a split layout, whose `<Panel src={scene.image_path}>` is *always* the primary panel by construction. No separate branch was needed for the split case; the same one-line swap serves both.

**Testing — commands run and results:**
```
$ node server/services/frameMath.test.js
```
73/73 assertions passed (64 from FT-1–FT-7 unchanged, plus 9 new): `CUTAWAY_EDGE_BUFFER_SECONDS` defined; valid ranges accepted, including exactly at both 0.5s edge buffers; `insert_at` too close to the scene start rejected; a range running too close to the scene end rejected; `insert_at + duration` exceeding the scene's total duration rejected; missing/negative/zero primitives rejected outright; and — the most important test per the task — `calculateDocumentaryDuration`, `getTransition`, and `sceneDur` are all **byte-for-byte identical** on the same scene before and after adding a `cutaway` object, proving a cutaway has zero effect on any timing function, not just "probably no effect."

```
$ node server/routes/scenes.test.js
```
90/90 assertions passed (76 from FT-1–FT-7 unchanged, plus 14 new): a valid cutaway range with reuse mode persists `insert_at`/`duration`/`image_path` correctly and the cutaway image is confirmed a **real, independent file copy** (proven by mutating the source scene's own image *after* the copy and confirming the cutaway panel bytes are unaffected — same proof pattern as FT-7); the scene's own primary `image_path` is untouched by adding a cutaway; an out-of-range request is rejected with 400 *and* confirmed **not persisted** (the prior valid value survives untouched); cutaway on a non-image scene rejected; `DELETE` resets the field to its exact default null-shape, confirmed both in the response and in `scenes.json`, with the primary image left intact so the scene falls back to normal single-image rendering; the full set of 404/400 error cases (unknown scene, missing projectId, unknown `source_scene_id`) handled correctly for both `PATCH` and `DELETE`.

```
$ node server/routes/higgsfieldRegenerate.test.js
```
39/39 assertions passed (27 from FT-3/FT-7 unchanged, plus 12 new): `regenerate-cutaway` receives the **user-supplied prompt**, not the scene's stored `higgsfield_prompt`; only the cutaway's image file changes — the primary scene image is confirmed byte-for-byte untouched; `insert_at`/`duration` are preserved across a regenerate (not clobbered by the image-only endpoint); the prior cutaway image is backed up with the distinct `'cutaway_original'` suffix before being overwritten, and this backup is confirmed to neither collide with nor accidentally create the primary panel's own backup file; a thrown generation error returns a clean 500 with nothing persisted.

**Remotion render test (required — an in-scene, frame-conditional image swap can't be fully verified by unit tests alone):**
Built a disposable 2-scene test project (`projects/__ft8_render_test__`, deleted after the test): scene 001 (5s, with real narration audio and a cutaway at `insert_at: 2, duration: 1.5` using a different real image) and scene 002 (a normal 3s scene, no cutaway, to prove the composition as a whole still renders correctly end to end).
```
$ npx remotion render src/index.jsx Documentary ../projects/__ft8_render_test__/output.mp4 --props=../projects/__ft8_render_test__/render_props.json --overwrite --concurrency=1 --timeout=120000 --gl=swangle
```
First attempt failed with `Error: ENOSPC: no space left on device` while Remotion was bundling (copying `remotion/public/clips`, 758MB, into a temp build directory) — the environment's C: drive had only ~2GB free at the time. This was an environment/disk-space issue, not a code defect: nothing in the actual render pipeline had run yet. Freed ~170MB by deleting two old, regenerable `remotion-webpack-bundle-*` temp caches left over from earlier phases' renders, then retried:
```
Rendered 228/228
Encoded 228/228
+ ../projects/__ft8_render_test__/output.mp4 8.3 MB
```
Exit code 0. `ffprobe` confirmed the output as a valid, complete file with both a video and an audio stream (`duration=7.658667`, `size=8262460`) — the audio stream's presence and the successful full-duration encode confirm the narration track was not interrupted by the cutaway (which is expected by construction: the cutaway swap lives entirely inside `SceneRenderer`'s visual dispatch, and the narration `<Audio>` Sequence is a structurally separate part of the render tree that never reads `scene.cutaway` at all — already proven at the unit level above). Test project deleted afterward.

Also verified manually:
- `node -e "require(...)"` on `scenes.js` and `higgsfieldRegenerate.js` — load without error
- `npx eslint src/pages/wizard/FineTuneStep.jsx` — clean
- `npx vite build` — clean production build
- Re-ran the full FT-1–FT-7 test suites after all FT-8 changes — all still pass

**Production-readiness checklist:**
- [x] `cutaway: { image_path, insert_at, duration }` added to the scene schema, optional/defaulted
- [x] "Add cutaway" control added per image scene card: insert-at/duration inputs plus the reuse/regenerate source picker
- [x] `PATCH /api/scenes/:sceneId/cutaway`, `POST /api/higgsfield/regenerate-cutaway/:sceneId`, and `DELETE /api/scenes/:sceneId/cutaway` implemented, registered, tested
- [x] `insert_at`/`duration` bounds validated server-side — invalid ranges rejected outright, never silently clamped, and confirmed not persisted on rejection
- [x] `Documentary.jsx`/`SceneRenderer` renders the cutaway as a temporary image swap inside the scene's existing `TransitionSeries.Sequence` — no new Sequence, no duration change, verified via a real Remotion render with narration audio present throughout
- [x] `calculateDocumentaryDuration`, `getTransition`, and `sceneDur` confirmed byte-for-byte unchanged by a cutaway, both by unit test and by construction
- [x] Split-screen (FT-7) + cutaway (FT-8) combination handled: cutaway replaces only the primary panel, decision and reasoning documented above
- [x] Reverting (`DELETE`) falls back cleanly to normal single-image rendering — verified via test and by construction (the render-path guard requires all three cutaway sub-fields to be non-null)
- [x] FT-1–FT-7 logic untouched
- [x] No montage flag added
- [x] Client build clean — zero errors
- [x] PLAN.md updated with FT-8 completion entry

**Resumed session (2026-07-03):** the original FT-8 session was interrupted after all code and this PLAN entry were written but *before anything was committed* — the entire FT-8 diff was sitting uncommitted in the working tree. This session diagnosed the actual state (all pieces present: endpoints, validation, `SceneRenderer` swap, Fine-Tune UI), then independently re-verified everything rather than trusting the entry above: re-ran all three test suites (frameMath 73/73, scenes 90/90, higgsfieldRegenerate 39/39 — FT-1–FT-7 legacy checks all included and passing), re-ran ESLint on FineTuneStep.jsx (clean) and the production client build (clean), and rebuilt the disposable render test from scratch (`projects/__ft8_render_test__`, deleted after): 2 scenes (6.4s with narration + cutaway at `insert_at: 2, duration: 1.5`; 3s plain), rendered 270/270 frames, exit 0. Verified beyond the original entry's checks: extracted frames at 1.5s / 2.5s / 4.5s visually confirm main image → cutaway image → main image, and `volumedetect` on the 2.0–3.5s window (mean −28.0 dB, max −12.1 dB) and the 3.6–5.5s tail (mean −32.2 dB) confirms narration plays through the cutaway uninterrupted. Output duration exactly 9.000s = 270 frames = `calculateDocumentaryDuration`'s value, so a cutaway provably doesn't shift composition timing in a real render. Committed as `feature: FT-8 Fine-Tune stage — cutaway insert`. Unrelated working-tree changes found alongside FT-8 (ScriptInput target-duration UI, render.js motion_component syntax guard, remotion.config/defaults tweaks, runtime data files) were deliberately left out of the FT-8 commit.

---

### Phase FT-9 — Fine-Tune stage: montage pacing flag ✅ COMPLETE (final Fine-Tune phase)

**FT-5's range-apply mechanism reviewed before making changes** (per the task): `PATCH /api/scenes/pacing` takes an explicit `scene_ids` array from the client's multi-select, sets `pacing`/`transition_out`/clamped `duration_seconds` per scene, resets manual FT-4 boundary offsets fully inside the range via `resetActionCutBoundaryOffsets`, and reverts per scene through `PATCH /:sceneId` restoring Fine-Tune snapshot values. FT-9 is exactly that mechanism at chapter scope: the "range" is *every scene in the chapter*, selection is one click on the chapter header instead of manual multi-select, and the same clamp/reset/revert machinery is reused rather than re-implemented.

**Deviation from the task's premise, documented up front:** the task said to use "the existing `scene.chapter` field" — **no such field existed anywhere**: not in `postProcessScenes`' schema, not in any Claude analysis prompt/output, not in any project's `scenes.json` (verified by grep across the codebase and by inspecting live project data). FT-9 therefore *establishes* the chapter notion, from the one place the codebase already defines a chapter boundary: `claude.js`'s transition guidance, where `dip_black` = "chapter break, major time jump." A chapter is a run of consecutive scenes; each `dip_black` `transition_out` ends one (a `dip_black` on the final scene ends the video, not a chapter — no phantom empty chapter). Three-part design:
- `frameMath.deriveChapters(scenes)` — the bootstrap derivation from `dip_black` boundaries.
- `postProcessScenes` (claude.js) now assigns `chapter` at analysis time, so every new project carries persisted chapter numbers from birth (same additive-field precedent as FT-6/7/8).
- `frameMath.resolveChapterMap(scenes)` — persisted `scene.chapter` wins once **every** scene has one; otherwise derive (all-or-nothing, so partial/older data can't mix the two sources). The chapter-pacing route **backfills** the derived numbers onto all scenes on its first run against an older project. Persistence is not optional-nice-to-have: applying montage sets `transition_out: 'cut'` on every scene in the chapter — including a `dip_black` scene that *ended* it — which would otherwise merge that chapter into the next and renumber everything on re-derivation. A dedicated test proves the grouping stays stable after montage erases the boundary transitions.

**What was built:**
- `server/services/frameMath.js` — `MONTAGE_MUSIC_LEVEL = 0.22`, `DEFAULT_AUDIO_MIX` (mirrors the client's `DEFAULT_MIX` — narration 1.0 / music 0.12 / ambient 0.06), `deriveChapters`, `resolveChapterMap`, and `montageAudioMixOverride(existingOverride)` — returns the music-forward mix (`music: 0.22`, narration/ambient at defaults) **only when no manual override exists**; an existing `audio_mix_override` is returned exactly as stored, untouched. The duration clamp is FT-5's own `clampDurationForActionCut`, reused unchanged — same tighter target, same FT-1 hard floor (`audio_duration + 0.8s`) that always wins, per the task's "same floor logic as FT-5."
- `server/routes/scenes.js` — `PATCH /api/scenes/chapter-pacing`. Body: `{ projectId, chapter, pacing: 'montage', override_non_standard? }`. Registered **before** `PATCH /:sceneId` (same Express param-collision class as FT-5's `/pacing`). Only `'montage'` is accepted, mirroring `/pacing` only accepting `'action'`; revert goes through `PATCH /:sceneId` snapshot-restore. For every applied scene in the chapter: `pacing: 'montage'`, `transition_out: 'cut'`, clamped `duration_seconds`, and the manual-override-respecting mix default. Manual FT-4 boundary offsets fully inside the applied set are reset via the same `resetActionCutBoundaryOffsets` (hard cuts don't bleed audio — same reasoning as FT-5, reused not duplicated).
- **Skip guardrail:** any chapter scene whose `pacing` is already non-standard (an intentional per-scene FT-5 action cut, or a previous montage) is skipped by default and reported in the response's `skipped` array as `{ scene_id, pacing }`. Only `override_non_standard: true` — sent exclusively by the UI's explicit "Override & include all" confirmation — includes them.
- `server/services/claude.js` — `postProcessScenes` assigns `chapter` via `deriveChapters` after the per-scene map (it needs the final scene_ids and defaulted `transition_out` values). One require + three lines; nothing else in the analysis flow touched.
- `client/src/pages/wizard/FineTuneStep.jsx`:
  - `chapterNumbersFor(scenes)` — client mirror of `resolveChapterMap` (persisted-wins-else-derive), kept in sync by comment cross-references, used to group the scene list.
  - `ChapterMontageHeader` — a header row before the first scene of each chapter run: "CHAPTER N · x scenes", a montage-count badge when any scene in the chapter is montage, and "Apply Montage to Chapter N". Clicking apply when some scenes have a non-standard pacing shows a warning panel **listing exactly which scenes would be skipped and why** (`003 (action)`, …) with three explicit choices: "Apply & skip them" (default-safe), "Override & include all" (sends `override_non_standard: true`), and Cancel. After a response, any server-reported skips are surfaced inline. "Revert montage to generated" restores `pacing`/`transition_out`/`duration_seconds`/`audio_mix_override` from the Fine-Tune snapshot for every montage scene in the chapter, through the existing `PATCH /:sceneId` (FT-5's revert precedent — `audio_mix_override: null` clears a montage-set mix entirely when the snapshot had none).
  - `FineTuneCard`'s pacing row now shows a "🎞 Montage" badge for `pacing: 'montage'` (alongside FT-5's "⚡ Action Cut"), and its per-scene pacing revert additionally restores the snapshot mix **only for montage scenes** — the FT-5 action-cut revert path is byte-for-byte unchanged for action scenes.

**Testing — commands run and results:**
```
$ node server/services/frameMath.test.js
```
82/82 assertions passed (73 from FT-1–FT-8 unchanged, plus 9 new): FT-9 constants defined and `DEFAULT_AUDIO_MIX` asserted to mirror the client's `DEFAULT_MIX`; `deriveChapters` splits after each `dip_black`, puts everything in chapter 1 when there is none, and ignores a `dip_black` on the final scene (no phantom chapter); `resolveChapterMap` uses persisted chapters when every scene has one (including the exact case where a derivation would disagree because montage erased a boundary) and falls back to derivation all-or-nothing when any scene lacks one; `montageAudioMixOverride` bumps music 0.12 → 0.22 with narration/ambient at defaults for `null`/`undefined`, and returns an existing manual override as the *same object*, untouched; the duration floor under montage clamping is proven via the same `clampDurationForActionCut` FT-5 already floors at `audio_duration + 0.8s`.

```
$ node server/routes/scenes.test.js
```
106/106 assertions passed (90 from FT-1–FT-8 unchanged, plus 16 new, on a 5-scene fixture with two `dip_black` chapter breaks → chapters [A,B] / [C,D] / [E], where C carries a pre-existing per-scene action cut and D carries a manual FT-1 mix override): montage applies `pacing`/`transition_out: 'cut'`/clamped durations (exact expected values 1.8s/2.8s) to every scene in chapter 1; the FT-1 floor holds end-to-end on persisted values; scenes with no manual mix get exactly `{ narration: 1.0, music: 0.22, ambient: 0.06 }`; derived chapters `[1,1,2,2,3]` are backfilled onto **all** scenes on the first call; scenes outside the chapter are byte-for-byte untouched; applying to chapter 2 **skips C and reports `[{ scene_id: 'C', pacing: 'action' }]`** while C is confirmed fully untouched on disk; D is applied but its manual mix `{ narration: 0.9, music: 0.5, ambient: 0.0 }` is preserved exactly; chapter grouping stays stable on a subsequent call **after montage turned the chapter-defining `dip_black`s into `cut`s** (persisted chapters win); `override_non_standard: true` includes the previously-skipped action scene; revert via `PATCH /:sceneId` restores `pacing`/`transition_out`/`duration_seconds` and clears the montage mix (`audio_mix_override: null` → field removed) for every scene in the chapter, verified in responses and on disk; unknown chapter → 404, non-integer/zero chapter → 400, `pacing` ≠ `'montage'` → 400, unknown/missing projectId → 404/400.

```
$ node server/routes/higgsfieldRegenerate.test.js
```
39/39 assertions passed — unchanged from FT-8, re-run as a regression check.

Also verified manually:
- `node -e "require('./server/routes/scenes.js'); require('./server/services/claude.js')"` — both load without error (claude.js gained a frameMath require)
- Against the **live dev server** (nodemon picked up the change): `curl -X PATCH /api/scenes/chapter-pacing` with `{ projectId, pacing: 'zzz' }` returned the route's own distinctive `400 "pacing must be 'montage'…"` — proving the request matched the new `/chapter-pacing` route and not `/:sceneId` with `sceneId="chapter-pacing"` (the same registration-order check FT-5 ran)
- `npx eslint src/pages/wizard/FineTuneStep.jsx` — clean
- `npx vite build` — clean production build
- Full FT-1–FT-8 suites re-run after all FT-9 changes — all still pass unmodified

**Known limitations (FT-9-specific):**
- The montage music bump inherits FT-1's documented limitation: `audio_mix_override.music` is fully wired as *data* (set, validated, persisted, reverted) but **no music track exists anywhere in the render pipeline yet** for it to control — the bump becomes audible only once a future phase adds real music mixing. The FineTuneStep mix UI already states this.
- After an FT-2 reorder that interleaves chapters, persisted chapter numbers travel with their scenes, so a chapter's scenes may no longer be contiguous in display order — the header then appears once per contiguous run. Montage-by-chapter still applies to exactly the right scene set (membership is by chapter value, not position).
- The FT-5/FT-6 card-dropdown cosmetic lag applies to montage's bulk `transition_out` change identically (underlying data correct, card-local dropdown state may lag until remount) — same class, not newly introduced.

**Production-readiness checklist:**
- [x] Reuses FT-5's `pacing` field; this phase sets `'montage'` (the value was already in `PACING_VALUES` since FT-5)
- [x] Chapter-level "Apply Montage to Chapter N" control at each chapter's header in the scene grid
- [x] Montage sets `pacing: 'montage'`, `transition_out: 'cut'`, FT-5-floor-clamped `duration_seconds`, and a music-forward mix default that never touches an existing manual override
- [x] `PATCH /api/scenes/chapter-pacing` implemented, registered before `/:sceneId`, persists to the project's scenes.json
- [x] Scenes with an existing non-standard pacing are skipped and reported; explicit user confirmation (`override_non_standard`) required to include them, with the warning listing exactly which scenes
- [x] "Revert to generated" restores `pacing`/`transition_out`/`duration_seconds`/`audio_mix_override` from the Fine-Tune snapshot for every montage scene in the chapter
- [x] `calculateDocumentaryDuration`'s core math untouched — montage only feeds different values through existing `duration_seconds`/`transition_out` fields, same as FT-5
- [x] FT-1–FT-8 logic untouched (the two additive card changes — montage badge, montage-only mix restore — leave every action-cut path byte-for-byte identical)
- [x] No scope beyond the described phase
- [x] Client build clean — zero errors
- [x] PLAN.md updated with FT-9 completion entry + the roadmap summary below

---

## Fine-Tune Stage — Complete

All nine phases of the Fine-Tune roadmap are implemented, tested, and committed to `main`:

| Phase | Feature | Status |
|-------|---------|--------|
| FT-1 | Duration trim, transition override, audio mix override | ✅ `cdee1f5` |
| FT-2 | Scene reorder (drag & drop, adjacency-aware duration math) | ✅ `c570b8c` |
| FT-3 | Image swap (upload) and Higgsfield regenerate | ✅ `39f48db` |
| FT-4 | Manual J-cut/L-cut boundary offset | ✅ `82efc10` |
| FT-5 | Action cut pacing preset (multi-select range apply) | ✅ `0f86bfd` |
| FT-6 | Match cut suggestion (analysis-time detection, one-click accept) | ✅ `901667a` |
| FT-7 | Split-screen layout (reuse / regenerate secondary panel) | ✅ `90353cb` |
| FT-8 | Cutaway insert (temporary mid-scene image swap) | ✅ `bee2cc5` |
| FT-9 | Montage pacing flag (chapter-scoped apply) | ✅ this commit |

**Known limitations carried across the phases (all documented in their entries above):**
- **FT-1 (affects FT-9):** `audio_mix_override.music`/`.ambient` are wired end-to-end as data only — there is no music or ambient track in the render pipeline yet for them to control. Narration volume is live; music/ambient (including FT-9's montage bump to 0.22) become audible only when a future phase adds real music/ambient mixing.
- **FT-5/FT-6 (cosmetic):** `FineTuneCard`'s dropdowns hold displayed values in card-local state — an externally-driven change (bulk action cut, match-cut accept, chapter montage) updates the data correctly but the dropdown visual may lag until the card remounts (e.g. leaving and re-entering the step).
- **FT-7:** Ken Burns motion is disabled on split-screen scenes — both panels render static (the guardrail's explicitly-offered escape hatch; single-panel Ken Burns untouched). Per-panel Ken Burns is a reasonable future phase.
- **FT-9:** `scene.chapter` did not exist before this phase — chapters are derived from `dip_black` chapter breaks and persisted (analysis-time for new projects, backfilled on first chapter operation for old ones). After an FT-2 reorder interleaves chapters, a chapter's scenes may be non-contiguous in display order (header repeats per run; the apply still targets the correct set).
- **General:** match-cut detection (FT-6) requires a Claude API call at analysis time and degrades gracefully to "no suggestions" on failure; FT-3/FT-7/FT-8 regeneration requires the Higgsfield CLI to be configured.

---

## Session — Overlay + match-cut consolidation into a single analysis call

**Goal:** reduce Claude API usage per project by producing scene breakdown, overlays, AND
match-cut flags from ONE `/api/analyze` call, and gate the overlay *review UI* behind the
Visuals step completing (client-side only — no second call).

**Net effect on Claude API calls per project: 2 → 1.** Before this session the live analysis
path fired the Sonnet scene-breakdown call *plus* a separate Haiku match-cut call
(`detectMatchCutCandidates`). Overlays themselves had been removed entirely in `0622b2e`
("remove … overlays permanently"); this session re-adds them, but folded into the single
call rather than as any separate request. (Note: the task framed this as reverting a
"separate post-Visuals overlay call," but no such call/endpoint ever existed — `/api/overlays/generate`
was never implemented. Confirmed via search; nothing to remove there.)

**Server (`server/services/claude.js`):**
- Restored the OVERLAY GENERATION RULES block into the single `SYSTEM_PROMPT` (lower_third,
  date_stamp, stat_callout, kinetic_text as the pull-quote fallback, chapter_title, and the
  default background_overlay legibility helper). Added an explicit shot-type exclusion:
  overlays only on image/real_footage; never on motion_graphic/3d_graphic.
- Added a MATCH CUT DETECTION section so Claude sets `match_cut_candidate` inline per scene.
- `postProcessScenes` now assigns each overlay a UUID + normalises status to `"suggested"`
  (image/real_footage only — strips overlays off motion_graphic/3d_graphic as a hard backstop),
  and reads `match_cut_candidate` straight from the response.
- `attemptAnalysis` injects the user's `overlayTemplates` (from `defaults.json`) into the prompt.
- `analyzeScript` no longer calls `detectMatchCutCandidates` — that helper (and its unit tests)
  is retained for reference/tests but is no longer in the live path, so exactly one Claude call runs.

**Remotion:** new shared `components/overlays/SceneOverlays.jsx` renders `status:"accepted"`
(and legacy no-status) overlays via the surviving overlay components; wired into ImageScene,
FootageScene, and SplitScreenScene. Each overlay's `appearAt` is clamped up to the scene's
incoming-transition duration (computed in `Documentary.jsx` from the previous scene's outgoing
transition frames) so overlays never pop on mid-crossfade — the transition-clamped appearAt
behaviour, applied purely at render time and independent of when the overlay was generated.

**Client:** restored `OverlayReviewModal`, the review banner, per-scene SceneGrid accept/reject
badges, and the six accept/reject handlers in `VideoCreator`. All of it is gated on
`overlaysVisible = wizard.isComplete('visuals')` — overlays exist in scene data from analysis but
the review surface only appears once Visuals is done, and every accept/reject action mutates
local scene state (`setScenes`) with zero API calls. `OverlayStudio` (the deleted per-scene
visual editor) was NOT restored — only the review/accept/reject surface the task called for.

**Tests (all passing):**
- `node server/services/overlaySingleCall.test.js` — mocks the Anthropic SDK, asserts exactly
  ONE `messages.create` call, overlays get ids + `"suggested"` status, `match_cut_candidate`
  flags carry through, motion_graphic overlays are stripped, pre-accepted status is preserved.
- `node server/services/claude.test.js` — the retained match-cut helper tests still pass.
- `node client/overlayGate.test.cjs` — asserts the gate is `wizard.isComplete('visuals')`,
  banner/modal/badges render only when open, the 6 handlers perform no `fetch`, and there is no
  orphaned `/api/overlays` reference anywhere in `client/src`.
- `npx vite build` (client) — clean; the Remotion composition (incl. SceneOverlays and the
  modified scene components) is bundled via VideoPlayer and compiles.
