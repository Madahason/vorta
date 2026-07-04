const Anthropic = require('@anthropic-ai/sdk');
const { randomUUID } = require('crypto'); // overlay ids assigned at analysis time
const { deriveChapters } = require('./frameMath'); // FT-9: chapter numbers from dip_black chapter breaks

const STYLE_LOCK = 'dark cinematic 4K shallow depth of field slow dolly movement documentary aesthetic muted tones';

const SYSTEM_PROMPT = `You are a senior documentary video producer and scene breakdown specialist. You transform scripts into precise visual scene packages for a Remotion-based AI video pipeline.

For each scene assign one of four shot types:
- "image" — AI-generated still + Ken Burns animation. Best for: abstract concepts, passive statements, atmospheric establishing shots.
- "motion_graphic" — Animated Remotion component. Use when there is an explicit statistic, number, timeline, or comparison to visualise.
- "real_footage" — Stock clip match by tags. Use whenever the script describes real people, real events, or real places in an active, visible way.
- "3d_graphic" — Three.js rotating globe. Use ONLY for geographic expansion, global reach, or international/multi-country scenes. Maximum 1 per video. Set globe_markers: [{ lat, lng, label, color }] for key locations.

SHOT TYPE ASSIGNMENT RULES

Use real_footage when the script describes ANY of these:
  - A specific named person doing something visible (speaking, walking, presenting, testifying)
  - A specific named event with documented video (product launch, press conference, hearing, protest)
  - A crowd, protest, or public gathering
  - A specific named location being shown as a place (not as a concept)
  - A sports moment, performance, or live event
  - Historical footage moments (moon landing, famous speeches, major disasters, stock market floors)

Use image for:
  - Abstract concepts or ideas with no visible human action
  - Data, statistics, or financial figures (use motion_graphic if a number is the main point)
  - Passive statements ("The company announced...", "was considered", "had been")
  - Internal corporate moments with no public documentation

Use motion_graphic for:
  - Any specific number, percentage, or financial figure that is the core of the scene
  - Timelines, comparisons, rankings, milestones
  - Any moment where a chart or counter would communicate better than footage or an image

SCENE TYPE DISTRIBUTION — STRICT RATIO:

For every video you analyze, distribute scene types as follows:
- 15% real_footage (stock footage scenes — rounded to nearest whole scene)
- 45% image (Higgsfield AI images with Ken Burns animation)
- 40% motion_graphic (animated data visualizations, stats, quotes, timelines)

For a 20-scene video:  3 real_footage,  9 image,  8 motion_graphic
For a 40-scene video:  6 real_footage, 18 image, 16 motion_graphic
For a 65-scene video: 10 real_footage, 29 image, 26 motion_graphic
For a 100-scene video: 15 real_footage, 45 image, 40 motion_graphic

REAL_FOOTAGE scenes — assign when:
- The script describes a location, environment, or atmosphere (city, office, nature)
- The script describes people in action (crowd, workers, audience)
- The script describes abstract concepts that stock B-roll can represent
  (growth, technology, finance, travel, teamwork)
- NEVER assign real_footage for specific named people or specific historical events
  (stock libraries don't have these — use image instead)

STOCK FOOTAGE works well for:
- "Wall Street trading floor" → real_footage (generic trading floor B-roll)
- "Silicon Valley offices" → real_footage (modern tech office B-roll)
- "Global shipping routes" → real_footage (aerial ocean/cargo B-roll)
- "Consumer spending" → real_footage (shopping, retail B-roll)

STOCK FOOTAGE does NOT work for:
- "Steve Jobs on stage at Moscone" → image (specific person, use Higgsfield)
- "The 2008 financial crash" → motion_graphic (data/stats work better)
- "Netflix founding in 1997" → image (historical moment, use Higgsfield)

MOTION_GRAPHIC scenes — assign when:
- The script contains a specific number, percentage, or financial figure
- The script describes a timeline, ranking, or comparison
- The script states a fact that a chart/counter/quote card would show better than footage
- The script has a single punchy statement worth showing as large text

IMAGE scenes — assign for everything else:
- Specific people, companies, products, historical moments
- Any moment where cinematographic AI art is more powerful than stock B-roll
- Atmospheric establishing scenes for specific subjects

SHOT TYPE EXAMPLES

BAD real_footage: "Apple became the first trillion-dollar company"
  → MOTION_GRAPHIC — financial milestone with a number as the story
BAD real_footage: "Regulators accused Apple of anti-competitive behaviour"
  → IMAGE — abstract institutional act, no specific event to film
GOOD real_footage: "Tim Cook testified before the US Senate in September 2020"
  → real_footage — named person in a specific datable event
GOOD real_footage: "Protesters gathered outside Apple stores in major cities in 2021"
  → real_footage — real crowd at a real location
GOOD real_footage: "Steve Jobs walked onto the Macworld 2007 stage and said 'one more thing'"
  → real_footage — named person at a specific documented moment
GOOD real_footage: "Workers at Foxconn's Zhengzhou factory assembled the first iPhones"
  → real_footage — real people doing visible work at a real location

SCENE BREAKDOWN DISCIPLINE

One scene = one visual idea. If a paragraph contains multiple distinct images, break it into multiple scenes.
Scale with script length: ~1 scene per 20 words (each scene reads for ~9 seconds). A 5-minute script (~650 words) → ~33 scenes. A 10-minute script (~1300 words) → ~65 scenes. A 15-minute script (~2000 words) → ~100 scenes.
Every word of the script must appear in exactly one scene's script_excerpt — cover the full script.

MOOD VALUES — use ONLY these exact values for the mood field:
tense, triumphant, somber, neutral, dramatic, reflective, anticipatory, institutional, intimate

Do not invent new mood names. Map every scene to the closest value from this list:
- tense: conflict, threat, danger, crisis, fear, confrontation, ominous, restrictive moments
- dramatic: reveal, discovery, intense moments, high-impact narrative beats
- triumphant: success, achievement, celebration, inspiration, hope
- somber: grief, loss, failure, melancholy, mourning
- reflective: nostalgia, contemplation, looking back, thoughtful moments
- anticipatory: building toward something, suspense, upcoming event
- institutional: corporate, political, regulatory, organizational moments
- neutral: background, context-setting, data-heavy, explanatory scenes
- intimate: personal stories, close character moments, quiet human scenes

SCENE TEXT RULES FOR VOICEOVER

Every script_excerpt will be read aloud by an AI narrator. It must be TTS-safe:
1. Always end with terminal punctuation — period, exclamation mark, or question mark. Never cut mid-sentence.
2. Minimum 8 words. If a natural scene break falls under 8 words, merge with the adjacent scene.
3. Target 12–22 words per scene (5–10 seconds of narration). Maximum 25 words. If a sentence exceeds 25 words, split at a comma, dash, or conjunction.
4. Remove any stage directions, speaker labels, parenthetical asides, or bracketed text.
5. Each excerpt must represent one complete thought or narrative beat.

HIGGSFIELD PROMPT RULES — CINEMATOGRAPHIC STANDARD

Every image prompt must read like a cinematographer's shot note. Specify all of:
SUBJECT + COMPOSITION + LIGHTING + PERIOD DETAIL + ATMOSPHERE

COMPOSITION — always specify one (also set the composition field):
- "extreme close-up of [subject detail]" → close_up
- "tight medium shot of [subject] centered left third" → medium
- "wide establishing shot of [location] with [subject] small in frame" → wide
- "aerial looking down on [subject/location]" → aerial
- "low angle looking up at [subject] against [background]" → low_angle
- "over-shoulder shot behind [subject] facing [direction]" → over_shoulder

LIGHTING — always specify one:
- "single overhead spotlight carving subject from darkness"
- "harsh fluorescent office lighting casting flat shadows"
- "golden hour backlight rim-lighting subject's silhouette"
- "multiple monitor screens casting cold blue light on face"
- "emergency lighting, red glow, dark corridors"
- "overcast grey light, flat and clinical"
- "streetlamp sodium orange against night sky"
- "television screen light flickering on darkened faces"

PERIOD DETAIL — always include one year-specific environmental detail:
- Technology visible (CRT monitors, early smartphones, fax machines)
- Fashion or hairstyle (wide ties 1990s, turtlenecks 2000s)
- Architecture or signage (brutalist concrete 1970s, glass and steel 2000s)
- Vehicle or product visible in background

ATMOSPHERE — always include one specific physical detail:
- "dust motes visible in the light beam"
- "rain streaking the glass behind"
- "cigarette smoke drifting across frame"
- "steam rising from coffee cup in foreground"
- "papers scattered across desk surface"
- "empty chairs in rows behind the subject"
- "crowd blurred in background bokeh"

BANNED — never use these words:
businessman, corporate, modern, futuristic, abstract, technology, professional,
success, growth, innovation, digital, concept, idea, office worker, suit

BAD prompt (forbidden):
"Modern technology company office with professionals discussing business strategy"

GOOD prompt (required):
"Tight medium shot of Reed Hastings at a glass table in Netflix headquarters Los Gatos 2011,
harsh overhead fluorescent lighting, early flat-screen monitors visible behind him,
papers and a red Netflix envelope on the table surface"

SUBJECT GROUNDING — every prompt must:
1. Name the actual subject by real name (Steve Jobs, not "the founder")
2. Include real location and year
3. Describe what is physically visible, not the theme or concept
4. Extract 3-6 subject_anchors — specific named entities (people, companies, products, events, places, years)
5. At least 2 anchors must appear verbatim in higgsfield_prompt
6. Minimum 40 characters of subject-specific content before the style lock

COMPOSITION FIELD — assign one of these to the composition field based on dramatic purpose:
- close_up: emotional moments, a person's face, key object detail
- medium: dialogue, action, most narrative scenes (default)
- wide: establishing location, scale revelation, isolation
- aerial: power, geography, scope
- low_angle: authority, threat, triumph
- over_shoulder: tension, conversation, surveillance feeling

MOTION — INTENTIONAL CAMERA MOVEMENT

Every image scene needs a motion assignment that matches the emotional weight of the moment:
- push_in: building dread, revelation, approaching a critical moment (collapse, launch countdown, confrontation)
- pull_out: scale, aftermath, stepping back from wreckage or triumph (IPO day, trillion-dollar milestone, ruins)
- drift_left: timelines, historical progression, walking through a story left to right
- drift_right: reverse-timeline, rewinding, recalling the past
- drift_up: aspiration, escape, achieving lift-off (product launch, stock price rise, founding moment)
- drift_down: descent, decline, gravity pulling downward (market crash, fall from power)
- static: death, failure, shock, gravity, decisive silence (firing, bankruptcy filing, product cancellation)

intensity:
- subtle: context/background/establishing
- moderate: main narrative beat
- strong: turning point, climax, emotional peak — use for no more than 3 scenes per script

OVERLAY GENERATION RULES

For every scene, analyze the script excerpt and generate an overlays array.
Apply these rules strictly:

SHOT-TYPE EXCLUSION (mandatory):
- ONLY image and real_footage scenes may carry text overlays.
- NEVER add any overlay to a motion_graphic or 3d_graphic scene — those render their own
  charts/counters/globe and text overlays would collide with that content. Return overlays: []
  for every motion_graphic and 3d_graphic scene.

LOWER THIRD rules:
- Add a lower_third when a real named person or company is introduced for the FIRST TIME in the entire script
- Track entity introductions across ALL scenes — never add a lower_third for an entity already introduced in a previous scene
- text.line1 = person or company name, text.line2 = their role/title/context at that moment
- Never add lower_third for abstract concepts, dates, or locations — only named people and companies
- Never add lower_third to more than one scene per named entity across the whole video

DATE STAMP rules:
- Add a date_stamp when the script mentions a specific year, date, or named location
- text.line1 = "City/Location · Year" or just "Year" if no location
- Maximum 1 date_stamp per scene
- Do not add date_stamp if a lower_third is already on this scene

STAT CALLOUT rules:
- Add a stat_callout when the script contains a specific financial figure, percentage, user count, or measurable milestone
- text.line1 = the number/stat with prefix/suffix (e.g. "$3T"), text.line2 = context label (e.g. "Market Cap · 2023")
- Maximum 1 stat_callout per scene
- Do not add stat_callout if another overlay type is already on this scene

KINETIC TEXT rules (pull-quote fallback):
- Add kinetic_text for a single punchy declarative statement that carries narrative weight — this is the pull-quote fallback for image/real_footage scenes that have no named entity, date, or stat to surface
- Use sparingly — maximum 1 in every 4 scenes across the whole video
- Examples: "The most valuable company in human history" / "90 days from bankruptcy"
- Never duplicate kinetic_text and stat_callout on the same scene

CHAPTER TITLE rules:
- Insert a chapter_title overlay on scenes that mark major narrative transitions (new era, new phase, new subject)
- text.line1 = "Chapter N", text.line2 = short evocative title (e.g. "The Fall")
- Maximum 3-5 across a full documentary
- Chapter title scenes should have no other overlays

BACKGROUND OVERLAY rules (default legibility helper):
- Add background_overlay (template "gradient_bottom") to any image/real_footage scene that carries another text overlay, so the text stays legible over the image
- background_overlay can combine with any other overlay type

PRIORITY RULES:
- lower_third takes priority over date_stamp on the same scene — never both together
- stat_callout and kinetic_text cannot coexist on same scene — pick the more impactful
- background_overlay can always be combined with other types
- Maximum 2 overlays per scene (excluding background_overlay)

OVERLAY OUTPUT FORMAT per scene:
"overlays": [
  {
    "type": "lower_third",
    "template": "USE_THE_TEMPLATE_FROM_USER_MESSAGE",
    "text": { "line1": "Steve Jobs", "line2": "Co-Founder · Apple" },
    "timing": { "appearAt": 0.7 },
    "confidence": 0.95,
    "reason": "First mention of Steve Jobs",
    "status": "suggested"
  }
]

- "status" must always be "suggested" — never "accepted"
- "template" must use the template name provided in the user message for that overlay type
- "confidence" is 0.0–1.0 — how certain you are this overlay is appropriate
- "reason" is a plain English explanation of why you added this overlay (maximum 10 words)
- Leave overlays: [] for purely atmospheric or action scenes with no named subjects, stats, or key locations

MATCH CUT DETECTION

Set match_cut_candidate: true on a scene when THIS scene and the NEXT scene (the following
scene in the array) share strong VISUAL continuity that would make a match cut work: matching
shapes or silhouettes, similar composition/framing, continuous motion direction, or color/lighting
continuity — NOT merely thematic or narrative similarity. Only image and real_footage scenes have a
comparable visual; never flag a boundary where either side is motion_graphic or 3d_graphic. Be
selective — most consecutive shots do NOT qualify. Set match_cut_candidate: false otherwise, and
always false on the final scene.

TRANSITIONS

- dissolve: default — smooth cross-fade for continuity
- cut: punch, urgency, shock — after static scenes, breaking news beats, product reveal frames
- dip_black: chapter break, major time jump (5+ years), death, collapse, silence
- dip_white: memory, product reveal, breakthrough moment, hope after darkness

COLOR GRADE

- cool_blue: default documentary grade — clean, authoritative, present-tense
- warm_amber: past events, nostalgia, archive feel, anything pre-2000
- desaturated: crisis, failure, bankruptcy, dismissal, bleak outcomes
- neutral: product shots, data/graph context, clean visual reveals
- magnates: teal shadows + orange highlights — high-impact MagnatesMedia style, use for peak narrative moments only
- high_contrast: punchy, confrontational — breaking revelations, urgency, climax scenes

LETTERBOX

- Set letterbox: true for image and real_footage scenes (cinematic 12% black bars)
- Set letterbox: false for motion_graphic scenes (bars would obscure chart data and text)

FIELD RULES

- scene_id: "001", "002", etc.
- script_excerpt: the exact sentences from the script this scene covers — must end with terminal punctuation, be 15-60 words, and contain no stage directions or bracketed text
- globe_markers: only for shot_type "3d_graphic" — array of { lat, lng, label, color } objects for key locations; [] otherwise
- duration_seconds: Set to 5 for all scenes. The pipeline overrides this with the actual narration time calculated from the word count of script_excerpt, so your value is a placeholder only.
- higgsfield_prompt: cinematographer's shot note — SUBJECT + COMPOSITION + LIGHTING + PERIOD DETAIL + ATMOSPHERE. MINIMUM 40 characters of subject-specific content. No style instructions (style lock is appended automatically).
- composition: "close_up" | "medium" | "wide" | "aerial" | "low_angle" | "over_shoulder" — assign based on dramatic purpose (see COMPOSITION FIELD rules above). Default "medium" if uncertain.
- motion_graphic_type: AnimatedCounter | TimelineBar | ComparisonChart | QuoteCard | MapHighlight
- clip_search_tags: 3-6 lowercase tags, specific enough to find real footage

SCENE COUNT — SCALE WITH SCRIPT LENGTH

Cover EVERY sentence of the script. Do not skip, summarize, or compress content.
The user message will tell you the target scene count based on word count — hit that target.
Minimum 8 scenes. No hard maximum — use as many scenes as needed to cover the full script.
Each scene should cover 30–50 words of script. Never leave script content unassigned.

AUDIO CUT RULES

Every scene carries two audio edit fields:
- "audio_cut": "hard" | "j_cut" | "l_cut"     — default "hard"
- "audio_overlap_seconds": 0 | 0.8–2.5         — 0 for hard, 0.8–2.5 for j/l cuts

Definitions:
  hard    — narration starts cleanly after the visual transition completes (default)
  j_cut   — the NEXT scene's narration begins playing while the CURRENT scene's image is still visible.
             Use when the next scene's words directly continue or answer a thought in the current scene.
             The audio pulls the viewer forward before the cut arrives.
  l_cut   — the CURRENT scene's narration continues playing after the NEXT scene's image has appeared.
             Use when the current narration introduces or explains what the next scene shows.
             The audio lingers as the new image confirms it.

Assignment rules:
- Default to "hard" for all scenes unless one of the above patterns clearly applies
- Maximum 1 j_cut or l_cut per 4 consecutive scenes — they lose impact if overused
- Never assign j_cut or l_cut to a scene with transition_out "dip_black" or "dip_white"
  (dips are deliberate dramatic pauses — audio continuity would undercut them)
- Never assign j_cut or l_cut to the last scene of the video
- audio_overlap_seconds must be 0 for "hard"; set 0.8–1.5 for j_cut; 0.8–2.0 for l_cut

COMPACT JSON RULES — CRITICAL FOR RESPONSE LENGTH

Keep each scene JSON compact to avoid truncation. Hard limits per field:
- higgsfield_prompt: maximum 40 words
- script_excerpt: 12–22 words per scene (must end at a sentence boundary). This keeps each scene to 5–10 seconds of narration. If a sentence is longer than 22 words, split at a comma or natural pause.
- subject_anchors: maximum 4 items
- clip_search_tags: maximum 4 items
- overlays: maximum 1 overlay per scene (pick the most important; background_overlay may accompany it)
- reason field in overlays: maximum 10 words
These limits are mandatory. Verbose responses get truncated and fail. Compact = complete.

Return ONLY a raw JSON array. No markdown, no explanation, no wrapper.

Example (Apple documentary):
{"scene_id":"001","script_excerpt":"It began not in a boardroom, but in a garage. Cupertino, California, 1976.","shot_type":"image","mood":"intimate","composition":"wide","higgsfield_prompt":"Wide establishing shot of a cluttered residential garage in Cupertino California 1976, wooden workbench covered in circuit boards and soldering equipment, bare concrete floor, single bare incandescent bulb overhead casting warm shadows, faded cardboard boxes stacked against wood-panel walls, a hand-painted Apple Computer sign propped against the workbench","subject_anchors":["Cupertino California","1976","Apple garage","Steve Jobs","Steve Wozniak"],"motion":{"type":"drift_right","intensity":"subtle"},"overlays":[{"type":"date_stamp","template":"minimal_pill","text":{"line1":"Cupertino, California · 1976"},"timing":{"appearAt":0.5},"confidence":0.9,"reason":"Establishes historical time and place","status":"suggested"}],"match_cut_candidate":false,"transition_out":"dissolve","grade":"warm_amber","motion_graphic_type":"","style_lock":"","real_footage_flag":false,"clip_search_tags":[],"duration_seconds":6}`;

// Build a fallback higgsfield_prompt from subject_anchors + script_excerpt
// Used when Claude returns an empty or malformed prompt
function buildFallbackPrompt(scene) {
  const anchors = (scene.subject_anchors || []).slice(0, 4).join(', ')
  const excerpt  = (scene.script_excerpt || '').slice(0, 100).trim()
  const base = anchors
    ? `${anchors}${excerpt ? `, ${excerpt}` : ''}`
    : excerpt
  console.warn(`[claude] scene ${scene.scene_id}: missing/empty higgsfield_prompt — built fallback: "${base}"`)
  return base || 'documentary scene establishing shot'
}

// Validate and ground every image/real_footage prompt:
// 1. Must contain at least one subject anchor word
// 2. Must not start with a comma (empty subject prefix)
// 3. Must have at least 30 chars of subject-specific content (before style lock)
function validateAndGroundPrompts(scenes) {
  return scenes.map(scene => {
    if (scene.shot_type !== 'image' && scene.shot_type !== 'real_footage') return scene
    if (!scene.higgsfield_prompt) return scene

    let prompt = scene.higgsfield_prompt.trim()

    // Fix comma-prefix bug: prompt assembled as ", style_lock" means subject was empty
    if (prompt.startsWith(',') || prompt.startsWith(', ')) {
      console.warn(`[claude] scene ${scene.scene_id}: prompt starts with comma — subject was empty, rebuilding`)
      prompt = buildFallbackPrompt(scene)
    }

    // Strip any style lock that was already appended (we re-append in analyzeScript)
    if (prompt.includes(STYLE_LOCK)) {
      prompt = prompt.replace(`, ${STYLE_LOCK}`, '').replace(STYLE_LOCK, '').trim()
    }

    // Enforce minimum subject-specific content length
    if (prompt.length < 30) {
      console.warn(`[claude] scene ${scene.scene_id}: prompt too short (${prompt.length} chars) — rebuilding`)
      prompt = buildFallbackPrompt(scene)
    }

    // Enforce subject anchor presence
    if (scene.subject_anchors?.length) {
      const promptLower = prompt.toLowerCase()
      const anchorWords = scene.subject_anchors
        .flatMap(a => a.toLowerCase().split(/\s+/))
        .filter(w => w.length > 3)
      const hasAnchor = anchorWords.some(w => promptLower.includes(w))
      if (!hasAnchor) {
        const topAnchor = scene.subject_anchors[0]
        console.warn(`[claude] scene ${scene.scene_id}: prompt not grounded — appending "${topAnchor}"`)
        prompt = `${prompt}, ${topAnchor}`
      }
    }

    return { ...scene, higgsfield_prompt: prompt }
  })
}

// ─── JSON extraction with truncation recovery ───────────────────────────────

function extractJSON(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Empty response from Claude');
  }

  console.log('[claude] response length:', text.length, 'chars');
  console.log('[claude] response tail:', text.slice(-100));

  // Strip markdown fences first
  const clean = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // 1. Direct parse
  try {
    const parsed = JSON.parse(clean);
    const arr = Array.isArray(parsed) ? parsed : (parsed.scenes || parsed);
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch {}

  // 2. Find array boundaries and parse
  const arrayStart = clean.indexOf('[');
  const arrayEnd   = clean.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    try {
      const parsed = JSON.parse(clean.slice(arrayStart, arrayEnd + 1));
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }

  // 3. Truncation recovery — find last complete scene object and close the array
  if (arrayStart !== -1) {
    const partial = clean.slice(arrayStart);

    // Find the last "},\n" or "}," pattern — marks end of a complete scene object
    const lastCompleteComma = partial.lastIndexOf('},');
    if (lastCompleteComma !== -1) {
      const recovered = partial.slice(0, lastCompleteComma + 1) + ']';
      try {
        const parsed = JSON.parse(recovered);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.warn(`[claude] TRUNCATION RECOVERY: recovered ${parsed.length} scenes from truncated response`);
          return parsed;
        }
      } catch {}
    }

    // Last resort: find last well-formed '}' and close
    const lastBrace = partial.lastIndexOf('}');
    if (lastBrace !== -1) {
      const recovered = partial.slice(0, lastBrace + 1) + ']';
      try {
        const parsed = JSON.parse(recovered);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.warn(`[claude] TRUNCATION RECOVERY (last-brace): recovered ${parsed.length} scenes`);
          return parsed;
        }
      } catch {}
    }
  }

  // 4. Try JSON object with scenes key
  const objStart = clean.indexOf('{');
  const objEnd   = clean.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(clean.slice(objStart, objEnd + 1));
      if (parsed.scenes && Array.isArray(parsed.scenes)) return parsed.scenes;
    } catch {}
  }

  console.error('[claude] could not parse response. First 500:', text.slice(0, 500));
  throw new Error(`Could not parse Claude response (length: ${text.length}). Last 100 chars: ${text.slice(-100)}`);
}

// ─── Narration duration from word count ─────────────────────────────────────
// TTS reads at ~130 wpm. We use this to set scene duration so the video length
// matches the script length without needing voiceover pre-generation.
// After real TTS audio is generated, duration_seconds is overridden by actual length.

const WORDS_PER_MIN    = 130;
const MIN_SCENE_SECONDS = 2.0;

function narratedDuration(scriptExcerpt) {
  const words = (scriptExcerpt || '').trim().split(/\s+/).filter(Boolean).length;
  if (words < 3) return null;
  // +0.6s tail buffer for sentence-final pauses and SSML breaks
  // Capped at 10s — if a scene excerpt is too long, TTS will override this after generation
  const raw = (words / WORDS_PER_MIN) * 60 + 0.6;
  return parseFloat(Math.min(raw, 10.0).toFixed(2));
}

// ─── Post-process: apply style lock, IDs, defaults ──────────────────────────

function postProcessScenes(scenes, defaults = {}) {
  const style = defaults.style || {};
  const processed = validateAndGroundPrompts(scenes).map((scene, i) => {
    const subjectPrompt = (scene.higgsfield_prompt || '').trim();

    let finalPrompt = '';
    if (scene.shot_type === 'image' || scene.shot_type === 'real_footage') {
      if (subjectPrompt && subjectPrompt.length >= 10) {
        finalPrompt = `${subjectPrompt}, ${STYLE_LOCK}`;
      } else {
        const fallback = buildFallbackPrompt({ ...scene, scene_id: String(i + 1).padStart(3, '0') });
        finalPrompt = `${fallback}, ${STYLE_LOCK}`;
      }
    }

    // Duration driven by word count so the video length matches narration time.
    // Falls back to Claude's estimate only if the excerpt is missing/too short.
    const duration = narratedDuration(scene.script_excerpt)
      ?? Math.max(MIN_SCENE_SECONDS, scene.duration_seconds || style.durationSeconds || 5);

    // Overlays: only image/real_footage scenes may carry them (motion_graphic/3d_graphic
    // exclusion — enforced here as a hard backstop even if Claude ignores the prompt rule).
    // Every overlay gets a stable UUID and its status normalised to "suggested" so the
    // client review UI has something deterministic to accept/reject. Chapter/background/etc.
    // rules themselves are unchanged — this only assigns ids and gates by shot type.
    const canHaveOverlays = scene.shot_type === 'image' || scene.shot_type === 'real_footage';
    const overlaysWithIds = canHaveOverlays
      ? (scene.overlays || []).map(o => ({
          id: o.id || randomUUID(),
          ...o,
          status: o.status === 'accepted' ? 'accepted' : 'suggested',
        }))
      : [];

    return {
      ...scene,
      scene_id:          String(i + 1).padStart(3, '0'),
      style_lock:        STYLE_LOCK,
      subject_anchors:   scene.subject_anchors  || [],
      composition:       scene.composition      || 'medium',
      motion:            scene.shot_type === 'image'
        ? (scene.motion || { type: style.motionType || 'push_in', intensity: 'subtle' })
        : null,
      overlays:          overlaysWithIds,
      transition_out:         scene.transition_out || style.transition || 'dissolve',
      grade:                  scene.shot_type === 'image' ? (scene.grade || style.grade || 'cool_blue') : null,
      letterbox:              scene.shot_type !== 'motion_graphic',
      duration_seconds:       Math.max(MIN_SCENE_SECONDS, duration),
      audio_cut:              scene.audio_cut              || 'hard',
      audio_overlap_seconds:  Number(scene.audio_overlap_seconds) || 0,
      globe_markers:          scene.globe_markers          || [],
      match_cut_candidate:    scene.match_cut_candidate === true, // FT-6: now produced inline by the single analysis call (see MATCH CUT DETECTION in SYSTEM_PROMPT)
      layout:                    scene.layout || 'single', // FT-7: split-screen layout
      secondary_image_path:      null,                     // FT-7: set via PATCH .../layout or regenerate-secondary
      secondary_source_scene_id: null,                      // FT-7: set only when reuse mode is chosen
      cutaway: { image_path: null, insert_at: null, duration: null }, // FT-8: temporary in-scene image swap
      higgsfield_prompt: finalPrompt,
      real_footage_flag: scene.shot_type === 'real_footage',
      clip_search_tags:  scene.clip_search_tags || [],
    };
  });

  // FT-9: chapter numbers, derived once at analysis time from dip_black chapter breaks
  // (the transition guidance above defines dip_black as "chapter break, major time jump").
  // Persisted here so later Fine-Tune edits to transition_out can't renumber chapters.
  // Runs after the map because it needs the final scene_ids and defaulted transition_out.
  const chapterMap = deriveChapters(processed);
  return processed.map(s => ({ ...s, chapter: chapterMap[s.scene_id] }));
}

// ─── Primary analysis attempt ────────────────────────────────────────────────

async function attemptAnalysis(script, metadata, defaults) {
  const client = new Anthropic();

  const wordCount = script.trim().split(/\s+/).length;
  const td        = metadata.targetDuration; // number (minutes) | 'full' | undefined

  let targetScenes, coverageInstruction;

  if (td && td !== 'full') {
    const targetWords = Math.min(wordCount, Math.round(td * WORDS_PER_MIN));
    targetScenes      = Math.min(100, Math.max(8, Math.ceil(targetWords / 20)));
    const pct         = Math.round((targetWords / wordCount) * 100);

    if (targetWords >= wordCount) {
      coverageInstruction = `Cover EVERY sentence — the full script fits within the ${td}-minute target.`;
    } else {
      coverageInstruction =
        `Select and cover the most important ~${targetWords} words (${pct}% of script) to produce a ${td}-minute video. ` +
        `Prioritise key narrative beats, turning points, data moments, and memorable lines. ` +
        `Skip transitional filler, repeated context, and padding. ` +
        `TARGET: ${targetScenes} scenes of 12–22 words each.`;
    }
  } else {
    targetScenes        = Math.min(100, Math.max(8, Math.ceil(wordCount / 20)));
    coverageInstruction = `Cover EVERY sentence — do not skip any part of the script. TARGET: ${targetScenes} scenes (~20 words each, 8–10 seconds per scene).`;
  }

  // 180 tokens per scene JSON object is a safe estimate
  const maxTokens = Math.min(64000, Math.max(16000, targetScenes * 180));

  console.log(`[claude] script ${wordCount} words | target ${td ?? 'full'} | ${targetScenes} scenes | max_tokens ${maxTokens}`);

  const overlayTemplates = defaults.overlayTemplates || {};
  const templateContext = `USER DEFAULT OVERLAY TEMPLATES (use these exact template names in every overlay you emit):
- lower_third template: ${overlayTemplates.lower_third || 'minimal_line'}
- date_stamp template: ${overlayTemplates.date_stamp || 'minimal_pill'}
- kinetic_text template: ${overlayTemplates.kinetic_text || 'center_impact'}
- stat_callout template: ${overlayTemplates.stat_callout || 'big_number'}
- chapter_title template: ${overlayTemplates.chapter_title || 'minimal_chapter'}
- background_overlay template: ${overlayTemplates.background_overlay || 'gradient_bottom'}`;

  const userMessage = `VIDEO TITLE: ${metadata.title || 'Untitled'}
NICHE: ${metadata.niche || 'General'}
STYLE PRESET: ${metadata.stylePreset || 'Dark Cinematic'}
NARRATOR TONE: ${metadata.narratorTone || 'Authoritative'}

${templateContext}

ENTITIES ALREADY INTRODUCED: [] (nothing yet — track named people/companies across scenes for lower_third dedup)

SCRIPT (${wordCount} words):
${script}

${coverageInstruction}
Generate overlays and set match_cut_candidate inline for every scene as instructed — do not omit these fields.
Keep all field values compact (see COMPACT JSON RULES).`;

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userMessage }],
  });

  const raw = message.content[0]?.text || '';
  console.log('[claude] stop_reason:', message.stop_reason);
  const scenes = extractJSON(raw);
  console.log(`[claude] returning ${scenes.length} scenes`);
  return scenes;
}

// ─── Simplified fallback analysis (minimal JSON per scene) ───────────────────

async function attemptAnalysisSimplified(script, metadata) {
  const client = new Anthropic();
  console.log('[claude] running simplified fallback analysis...');

  const wordCount = script.trim().split(/\s+/).length;
  const td        = metadata.targetDuration;

  let targetScenes, coverageNote;
  if (td && td !== 'full') {
    const targetWords = Math.min(wordCount, Math.round(td * WORDS_PER_MIN));
    targetScenes      = Math.min(90, Math.max(8, Math.ceil(targetWords / 20)));
    coverageNote      = targetWords >= wordCount
      ? `Cover the full script.`
      : `Select the most important ~${targetWords} words for a ${td}-minute video. Target ${targetScenes} scenes of 12–22 words each.`;
  } else {
    targetScenes = Math.min(90, Math.max(8, Math.ceil(wordCount / 20)));
    coverageNote = `Cover the full script. Target ${targetScenes} scenes of 12–22 words each.`;
  }

  const maxTokens   = Math.min(48000, Math.max(16000, targetScenes * 160));
  const scriptSlice = script.slice(0, Math.max(4000, wordCount * 6));

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages:   [{
      role:    'user',
      content: `Analyze this documentary script and return a JSON array of scenes.

Script (${wordCount} words): ${scriptSlice}

Return ONLY a valid JSON array. ${coverageNote}
Each scene object needs ONLY these fields:
- scene_id (string, zero-padded: "001")
- shot_type ("image" | "motion_graphic" | "real_footage")
- script_excerpt (20-50 words, complete sentence — cover a full thought)
- mood ("tense"|"triumphant"|"somber"|"neutral"|"dramatic"|"reflective"|"anticipatory"|"institutional")
- higgsfield_prompt (max 25 words, only for image/real_footage scenes, else "")
- motion_graphic_type (one of: "AnimatedCounter"|"QuoteCard"|"TimelineBar"|"ComparisonChart"|"MapHighlight" — only for motion_graphic, else "")
- duration_seconds (number, 4-7)
- subject_anchors (array, max 3 strings)
- composition ("medium")
- motion ({"type":"push_in","intensity":"moderate"})
- overlays ([])
- transition_out ("dissolve")
- grade ("cool_blue")
- use_sting (false)
- clip_search_tags (array, max 3 strings)
- audio_cut ("hard")
- audio_overlap_seconds (0)

Distribution: 15% real_footage, 45% image, 40% motion_graphic.
Return ONLY the JSON array, no markdown, no explanation.`,
    }],
  });

  const raw = message.content[0]?.text || '';
  console.log('[claude] simplified stop_reason:', message.stop_reason);
  return extractJSON(raw);
}

// ─── FT-6: match cut suggestion (RETAINED, NO LONGER IN THE LIVE PATH) ───────
// As of the overlay/match-cut consolidation, match_cut_candidate is produced inline by the
// single analysis call (see MATCH CUT DETECTION in SYSTEM_PROMPT), so analyzeScript no longer
// invokes this batched helper — that would be a second Claude call. The function and its
// helpers stay here because claude.test.js exercises them directly with an injected fake caller,
// and the batched pair-comparison remains a valid alternative implementation to reach for.
//
// (Historical note) Runs once, after the main scene breakdown, comparing each consecutive scene pair's
// visual prompt/composition for match-cut potential (shape/color/framing/subject
// continuity — not narrative similarity). Sets match_cut_candidate: true on the OUTGOING
// scene of any boundary Claude judges to qualify. Deliberately a single batched Claude call
// covering every pair at once, rather than one call per pair — for a 65-scene script that's
// 1 call instead of 64, which is both far cheaper and far less likely to time out.

const MATCH_CUT_SYSTEM_PROMPT = `You are a film editor identifying match cut opportunities between consecutive documentary shots.

A match cut works when two consecutive shots share strong VISUAL continuity: matching shapes or silhouettes, similar composition/framing, continuous motion direction, or color/lighting continuity — NOT just thematic or narrative similarity. Be selective; most consecutive shots do not qualify.

You will be given a numbered list of consecutive scene pairs, each with the outgoing shot's description and the incoming shot's description.

Return ONLY a raw JSON array of the outgoing scene_id strings (as strings, e.g. "003") where that pair has genuine match-cut potential. Return [] if none qualify. No markdown, no explanation, no other text.`;

function buildMatchCutPrompt(pairs) {
  const lines = pairs.map((p, idx) =>
    `${idx + 1}. OUTGOING scene ${p.a_scene_id} (${p.a_composition}): ${p.a}\n   INCOMING scene ${p.b_scene_id} (${p.b_composition}): ${p.b}`
  ).join('\n\n');
  return `Consecutive scene pairs to evaluate for match-cut potential:\n\n${lines}\n\nReturn the JSON array of outgoing scene_id strings that qualify.`;
}

// Dedicated minimal parser — NOT extractJSON. extractJSON assumes a non-empty scene array
// (its every fallback path requires parsed.length > 0) and throws on a legitimate "[]"
// response, which is a common and valid answer here ("no match cuts in this script"). Reusing
// it would risk misinterpreting "no candidates" as a parse failure.
function parseMatchCutResponse(text) {
  const clean = (text || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error('match-cut response was not a JSON array');
  return parsed;
}

// claudeCaller is injectable (defaults to the real callClaude below) so tests can supply a
// fake without needing real API credentials or monkey-patching module internals — callClaude
// is invoked here as a plain local function reference, so patching module.exports.callClaude
// from outside would not actually reach this call.
async function detectMatchCutCandidates(scenes, claudeCaller = callClaude) {
  if (!Array.isArray(scenes) || scenes.length < 2) return scenes;

  // Only image/real_footage scenes have a meaningful visual prompt to compare —
  // motion_graphic/3d_graphic scenes have no analogous field, skip those pairs entirely.
  const pairs = [];
  for (let i = 0; i < scenes.length - 1; i++) {
    const a = scenes[i], b = scenes[i + 1];
    const aVisual = (a.shot_type === 'image' || a.shot_type === 'real_footage') ? a.higgsfield_prompt : null;
    const bVisual = (b.shot_type === 'image' || b.shot_type === 'real_footage') ? b.higgsfield_prompt : null;
    if (!aVisual || !bVisual) continue;
    pairs.push({
      a_scene_id: a.scene_id, a_composition: a.composition || 'medium', a: aVisual,
      b_scene_id: b.scene_id, b_composition: b.composition || 'medium', b: bVisual,
    });
  }

  if (!pairs.length) return scenes;

  const raw = await claudeCaller(buildMatchCutPrompt(pairs), MATCH_CUT_SYSTEM_PROMPT);
  const candidateIds = new Set(parseMatchCutResponse(raw).map(String));

  console.log(`[claude] match-cut analysis: ${candidateIds.size}/${pairs.length} boundary pair(s) flagged as candidates`);

  return scenes.map(s => candidateIds.has(String(s.scene_id)) ? { ...s, match_cut_candidate: true } : s);
}

// ─── Public analyzeScript with retry ────────────────────────────────────────

async function analyzeScript({ script, metadata, defaults = {} }) {
  let scenes;
  try {
    scenes = await attemptAnalysis(script, metadata, defaults);
  } catch (err) {
    console.warn('[claude] primary analysis failed:', err.message);
    console.warn('[claude] retrying with simplified prompt...');
    scenes = await attemptAnalysisSimplified(script, metadata);
  }

  // Scene breakdown, overlays, AND match_cut_candidate flags all come from the SINGLE
  // analysis call above — postProcessScenes reads scene.match_cut_candidate and scene.overlays
  // straight from that response. FT-6 no longer fires a separate Claude request. The
  // detectMatchCutCandidates helper below is retained (and still unit-tested) for the batched
  // pair-comparison approach, but is intentionally NOT invoked in the live analysis path so
  // each project costs exactly one Claude call.
  return postProcessScenes(scenes, defaults);
}

// Generic Claude call for use by other services (e.g. clipIntelligence)
async function callClaude(prompt, systemPrompt = '') {
  const client = new Anthropic()
  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: prompt }],
  })
  return message.content[0].text.trim()
}

module.exports = {
  analyzeScript,
  callClaude,
  detectMatchCutCandidates,
  parseMatchCutResponse,
  buildMatchCutPrompt,
}
