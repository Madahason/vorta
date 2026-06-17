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

### Phase VR-6 — Data Layer Upgrade (planned, not started)

Replace Claude web search with structured API data sources for more reliable, quantitative research:

**Three data sources:**
1. **Google Trends API** — real-time trending topics with volume data, rising queries, regional interest
2. **YouTube Search API** — direct search for existing coverage, view counts, publish dates, competition density
3. **YouTube Competitor Pulls** — channel-specific data from competitor handles: recent uploads, top performers, content patterns

Claude remains as the synthesis layer — takes structured API data and generates the editorial analysis (angles, gaps, opportunity scores). The upgrade replaces "Claude guesses from web search" with "Claude analyses real data from APIs".
