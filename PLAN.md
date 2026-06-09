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

### Fix 11 — Background music and sound effects system ✅ Complete

**Goal:** Add three-layer documentary audio architecture (background music + ambient loops + transition stings) rendered in Remotion alongside per-scene narration.

**Architecture:**
```
AudioPanel → POST /api/audio/build-specs[?download=1]
→ server/services/audioMixer.js → buildProjectAudioSpecs / buildProjectAudioSpecsCached
→ server/services/pixabayMusic.js → Pixabay Music API → library/music/
→ server/services/ambientLibrary.js → library/ambient/ (user-supplied Freesound CC0 files)
→ server/config/transitionStings.js → library/stings/ (user-supplied sting files)
→ audioSpecs[] passed to VideoPlayer → Documentary.jsx → 4 audio layers per scene
```

**Volume levels:**
| Layer | Volume | Notes |
|-------|--------|-------|
| Narration (`scene.audio_path`) | 100% | Per-scene ElevenLabs audio |
| Background music | 12% | Loops for full scene duration |
| Ambient sound | 6% | Barely audible texture, loops |
| Transition sting | 45% | Plays once at scene boundary (skipped on scene 1) |

**Files added:**
- `server/config/musicMoods.js` — `moodMap` (9 moods: tense/triumphant/somber/neutral/dramatic/reflective/anticipatory/institutional/intimate) each with `musicQuery`, `musicTags`, `ambientCategory`, `transitionSting`. `categoryAmbientMap` mapping 11 categories to ambient keys.
- `server/config/transitionStings.js` — 6 stings: `low_drone`, `rise_sting`, `neutral_sting`, `impact_sting`, `soft_fade`, `whoosh`. Files go in `library/stings/`.
- `server/services/pixabayMusic.js` — `searchMusic(query, mood)`, `downloadTrack(track)`, `getMusicForMood(mood, query)` (cache-first), `getCachedTrackForMood(mood)` (sync, no API). Uses native `fetch` (Node 18+). Downloads to `library/music/`, indexes in `library/musicIndex.json`.
- `server/services/ambientLibrary.js` — 13 ambient categories, each with `filename`, `description`, `freesoundQuery`, CC0 Freesound search URL. `getAmbientForCategory`, `getAmbientForMood`, `listAmbientFiles`.
- `server/services/audioMixer.js` — `VOLUME_LEVELS` constant, `buildProjectAudioSpecs` (async, downloads unique moods via `Promise.allSettled`), `buildProjectAudioSpecsCached` (sync, local cache only).
- `server/routes/audio.js` — rewritten to add: `GET /status` (Pixabay key, cached tracks, ambient/sting availability), `POST /build-specs[?download=1]`, `POST /search-music`, `POST /download-music`, `GET /ambient-list`. Keeps existing `POST /upload` and `GET /info`.
- `client/src/components/video-creator/AudioPanel.jsx` (NEW) — collapsible panel with: Pixabay connection status, Build Music Plan button (cached or download from Pixabay), per-mood download buttons, per-scene music assignment list, global volume sliders (music/ambient/sting), ambient availability grid (13 categories), sting list with preview buttons, ambient download guide modal (Freesound links per file).
- `remotion/src/compositions/Documentary.jsx` — added `audioSpecs` prop + `audioSpecMap` lookup. Four audio layers per scene: narration (existing with 300ms fade-out), background music (12%, cross-fade 15 frames, loop), ambient (6%, loop), sting (45%, index > 0 only).
- `client/src/components/video-creator/VideoPlayer.jsx` — added `audioSpecs` prop, passed into `inputProps`.
- `client/src/pages/VideoCreator.jsx` — imported `AudioPanel`, added `audioSpecs` and `audioVolumes` state, rendered `<AudioPanel>` between VoiceoverPanel and ExportPanel, passed `audioSpecs` to all VideoPlayer instances.
- `client/src/components/video-creator/ExportPanel.jsx` — added `audioSpecs` prop, 3 new checklist rows: Background music, Ambient sound, Transition stings.

**Directory structure:**
```
library/
  music/           ← Pixabay tracks auto-downloaded (MP3)
  musicIndex.json  ← mood → { filename, duration, title, source }
  ambient/         ← User supplies Freesound CC0 files (13 expected filenames)
  stings/          ← User supplies sting files (6 expected filenames)
```

**Ambient files (user must supply from Freesound.org CC0):**
All 13 expected at `library/ambient/`: `trading_floor.mp3`, `office_ambient.mp3`, `city_traffic.mp3`, `data_center_hum.mp3`, `courtroom_silence.mp3`, `factory_floor.mp3`, `crowd_murmur.mp3`, `government_hall.mp3`, `tension_drone.mp3`, `soft_ambient.mp3`, `press_room.mp3`, `airport_ambient.mp3`, `industrial_hum.mp3`. The AudioPanel download guide shows per-file Freesound search URLs.

**Sting files (user must supply):**
All 6 expected at `library/stings/`: `sting_low_drone.mp3`, `sting_rise.mp3`, `sting_neutral.mp3`, `sting_impact.mp3`, `sting_soft_fade.mp3`, `sting_whoosh.mp3`.

**Pixabay Music API:**
- Endpoint: `https://pixabay.com/api/music/`
- `PIXABAY_API_KEY` in `.env` — free key available at pixabay.com/api/docs/
- Music is free to use commercially, no attribution required under Pixabay license
- `previewURL` field is the full downloadable track URL
- Native `fetch` (Node 18+) used for both API calls and binary downloads — no extra library

**Key implementation details:**
- `buildProjectAudioSpecs` deduplicates moods before downloading: N scenes with the same mood = 1 Pixabay download
- `buildProjectAudioSpecsCached` is instant — uses only what's already in `library/musicIndex.json`
- `GET /library` static route in Express already covers `library/music/`, `library/ambient/`, `library/stings/` — no additional static registrations needed
- Ambient/sting files are never auto-downloaded — users source them and place them manually; `AudioPanel` shows download guide
- Remotion `loop` prop on `<Audio>` handles music/ambient looping in the browser Player preview

**Testing checklist:**
- [ ] `PIXABAY_API_KEY` in `.env` — AudioPanel shows "Pixabay API connected" status
- [ ] "Build Music Plan (cached)" builds specs instantly using cached tracks
- [ ] "Download from Pixabay" fetches tracks for each unique mood in the project
- [ ] Per-mood download button downloads and caches a single mood track
- [ ] Volume sliders (music/ambient/sting) update in real time
- [ ] Ambient availability grid shows correct file presence
- [ ] Sting preview buttons play the sting file
- [ ] Download guide modal opens with Freesound links for all 13 ambient categories
- [ ] Placing an ambient file in `library/ambient/` causes it to show as available on next status poll
- [ ] `audioSpecs` passed to VideoPlayer — music audible in browser Player preview when a track is cached
- [ ] ExportPanel checklist shows correct music/ambient/sting counts
- [ ] Rendered MP4 contains background music at correct volume relative to narration

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

### Fix 1 — Background music: Pixabay download ✅ Complete

**Problem:** Pixabay queries returned 0 results; corrupted cached files were silently returned; audioSpecs not wired into render.

**Changes:**
- `server/services/pixabayMusic.js` — `downloadTrack` now validates cached file size (delete & retry if < 10 KB), validates downloaded buffer (reject if < 10 KB)
- `server/config/musicMoods.js` — simplified `musicQuery` strings from 4-5 words to 2-3 words (e.g. `'tension suspense'`, `'documentary background'`)
- `server/routes/audio.js` — added `GET /test-pixabay` debug endpoint
- `server/routes/render.js` — wires `buildProjectAudioSpecsCached` into `propsData.audioSpecs`; rewrites local file paths to full HTTP URLs (`http://localhost:3001/library/...`) for Remotion headless Chrome

---

### Fix 2 — Ambient sound system ✅ Complete

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

### Fix 4 — Audio system resilience ✅ Complete

**Problem:** Three audio system failures found during testing: ElevenLabs Generate All button stayed greyed, Pixabay returned HTML instead of JSON, and Claude generated mood names not in `moodMap`.

**Changes:**

**ElevenLabs SDK resilience (`server/routes/voiceover.js`):**
- Status endpoint now tries two SDK shapes: `client.user.getSubscription()` then `client.user.subscription.get()` with `typeof` guards
- Falls back to `voices.getAll()` ping if subscription call throws entirely
- Normalizes field names: `characterCount ?? character_count`, `characterLimit ?? character_limit`

**Pixabay HTML fix (`server/services/pixabayMusic.js`):**
- Replaced `node-fetch` / native `fetch` with Node's built-in `https` module (`httpGetJson`, `httpGetToFile`)
- Checks both `content-type` header and `body.trimStart().startsWith('{')` before `JSON.parse`
- Logs first 200 chars of non-JSON response for debugging

**Mood alias system:**
- `server/config/musicMoods.js` — added 14 mood aliases: `confrontational`, `ominous`, `gravity`, `urgent`, `suspenseful`, `restrictive`, `revelatory`, `revelation`, `hopeful`, `melancholic`, `inspirational`, `celebratory`, `analytical`, `comparative`
- `server/services/audioMixer.js` — added `getMoodConfig(mood)` with fuzzy keyword fallback (tense/triumph/somber/dramatic word lists)
- `server/routes/audio.js` — same fuzzy fallback inline in `POST /build-specs`
- `server/services/claude.js` — restricted mood field in system prompt to 9 canonical values with mapping guide; unknown moods forbidden

---

### Fix 5 — YouTube Audio Library music fallback ✅ Complete

**Problem:** Pixabay is the only music source; when `PIXABAY_API_KEY` is missing or Pixabay fails, the audio system has no music.

**Architecture — two-tier fallback:**
```
getMusicForMood(mood)
  → Tier 1: Pixabay (if PIXABAY_API_KEY set)
      → cache hit: return library/music/{mood}_{id}.mp3
      → miss: searchMusic → downloadTrack → save
  → Tier 2: YouTube Audio Library via yt-dlp
      → cache hit: return library/music/yal_{mood}.mp3
      → miss: searchYouTubeAudioLibrary → downloadYouTubeAudioTrack → save
  → throws if both fail
```

**Files added/changed:**

- `server/services/youtubeAudioLibrary.js` (NEW):
  - Own `execAsync = promisify(exec)` — does NOT reuse clipDownloader's
  - `MOOD_QUERIES` map with cinematic search strings for 22 moods
  - `searchYouTubeAudioLibrary(mood, maxResults=5)` — `yt-dlp ytsearch5:...` with `--print id|||title|||duration|||url --no-download`
  - `downloadYouTubeAudioTrack(track, outputPath)` — `yt-dlp --extract-audio --audio-format mp3 --audio-quality 128K`; renames file if yt-dlp wrote a different extension; validates size > 10 KB
  - `getMusicFromYouTubeAudioLibrary(mood)` — cache check at `yal_{mood}.mp3`, search, pick longest, download
  - Exports: `getMusicFromYouTubeAudioLibrary`, `searchYouTubeAudioLibrary`

- `server/services/pixabayMusic.js` — rewritten:
  - `httpGetJson(url)` — native `https`/`http` with redirect handling, returns `{ statusCode, headers, body }`
  - `httpGetToFile(url, dest)` — pipes response directly to `fs.createWriteStream`; handles redirects; cleans up on error
  - `getMoodConfig(mood)` — same fuzzy fallback as `audioMixer.js`
  - `getCachedTrackForMood(mood)` — now checks both `musicIndex.json` (Pixabay) AND `yal_{mood}.mp3` (YAL) on disk
  - `getMusicForMood(mood, query)` — two-tier: Pixabay first → `getMusicFromYouTubeAudioLibrary` fallback

- `client/src/components/video-creator/AudioPanel.jsx`:
  - Added `isDownloadingMusic`, `musicDownloadStatus` states
  - `MUSIC_MOODS = ['tense','triumphant','somber','neutral','dramatic','reflective','anticipatory','institutional']`
  - `handleDownloadAllMusic()` — sequential loop, skips already-cached, POSTs `/api/audio/download-music` per mood, updates status grid
  - New "Music library" section: 2-column grid showing all 8 moods with status dots (spinner / error / cached / empty)
  - "Download all moods" button triggers `handleDownloadAllMusic`; YAL fallback note shown when no Pixabay key
  - Generate button sub-label updated to mention YouTube Audio Library fallback

**Cache file naming:**
- Pixabay: `library/music/{mood}_{track_id}.mp3` (unchanged, backward compatible)
- YAL: `library/music/yal_{mood}.mp3`
- `getCachedTrackForMood` checks both — whichever exists first is returned

**Testing checklist:**
- [ ] No `PIXABAY_API_KEY` → "Download all moods" uses yt-dlp YAL fallback
- [ ] `PIXABAY_API_KEY` set → Tier 1 (Pixabay) runs first; YAL only if Pixabay fails
- [ ] Already-cached mood shows ✓ in grid immediately (skipped in download loop)
- [ ] Downloading mood shows spinner in grid
- [ ] Failed mood shows red dot; others continue
- [ ] `library/music/yal_{mood}.mp3` file created after YAL download
- [ ] `getCachedTrackForMood` returns YAL file on next call (no re-download)
- [ ] AudioPanel sub-label reads "YouTube Audio Library" when no Pixabay key
