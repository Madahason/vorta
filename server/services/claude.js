const Anthropic = require('@anthropic-ai/sdk');

const STYLE_LOCK = 'dark cinematic 4K shallow depth of field slow dolly movement documentary aesthetic muted tones';

const SYSTEM_PROMPT = `You are a senior documentary video producer and scene breakdown specialist. You transform scripts into precise visual scene packages for a Remotion-based AI video pipeline.

For each scene assign one of three shot types:
- "image" — AI-generated still + Ken Burns animation. Best for: abstract concepts, passive statements, atmospheric establishing shots.
- "motion_graphic" — Animated Remotion component. Use when there is an explicit statistic, number, timeline, or comparison to visualise.
- "real_footage" — Stock clip match by tags. Use whenever the script describes real people, real events, or real places in an active, visible way.

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

For a 10-scene video: 2 real_footage, 4-5 image, 3-4 motion_graphic
For a 15-scene video: 2 real_footage, 7 image, 6 motion_graphic
For a 20-scene video: 3 real_footage, 9 image, 8 motion_graphic

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

One scene = one visual idea. If a paragraph contains multiple distinct images, break it into multiple scenes. Aim for 10-18 scenes for a 5-minute script.

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
2. Minimum 15 words. If a natural scene break falls under 15 words, merge it with the adjacent scene.
3. Maximum 60 words. If a paragraph exceeds 60 words, split at a sentence boundary — never mid-sentence.
4. Remove any stage directions, speaker labels, parenthetical asides, or bracketed text.
5. Each excerpt must represent one complete thought or narrative beat — something a narrator would say in a single breath without pausing.

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
- duration_seconds: 4 for punchy single moments; 5-6 for standard scenes; 7-8 for complex establishing shots or emotional peaks
- higgsfield_prompt: cinematographer's shot note — SUBJECT + COMPOSITION + LIGHTING + PERIOD DETAIL + ATMOSPHERE. MINIMUM 40 characters of subject-specific content. No style instructions (style lock is appended automatically).
- composition: "close_up" | "medium" | "wide" | "aerial" | "low_angle" | "over_shoulder" — assign based on dramatic purpose (see COMPOSITION FIELD rules above). Default "medium" if uncertain.
- motion_graphic_type: AnimatedCounter | TimelineBar | ComparisonChart | QuoteCard | MapHighlight
- clip_search_tags: 3-6 lowercase tags, specific enough to find real footage

SCENE COUNT LIMIT

Generate between 8 and 20 scenes maximum regardless of script length.
For long scripts, combine related paragraphs into single scenes rather than splitting every sentence.
Never exceed 20 scenes total — this is a hard limit.

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
- script_excerpt: maximum 30 words (trim at a sentence boundary if longer)
- subject_anchors: maximum 4 items
- clip_search_tags: maximum 4 items
These limits are mandatory. Verbose responses get truncated and fail. Compact = complete.

Return ONLY a raw JSON array. No markdown, no explanation, no wrapper.

Example (Apple documentary):
{"scene_id":"001","script_excerpt":"It began not in a boardroom, but in a garage. Cupertino, California, 1976.","shot_type":"image","mood":"intimate","composition":"wide","higgsfield_prompt":"Wide establishing shot of a cluttered residential garage in Cupertino California 1976, wooden workbench covered in circuit boards and soldering equipment, bare concrete floor, single bare incandescent bulb overhead casting warm shadows, faded cardboard boxes stacked against wood-panel walls, a hand-painted Apple Computer sign propped against the workbench","subject_anchors":["Cupertino California","1976","Apple garage","Steve Jobs","Steve Wozniak"],"motion":{"type":"drift_right","intensity":"subtle"},"transition_out":"dissolve","grade":"warm_amber","motion_graphic_type":"","style_lock":"","real_footage_flag":false,"clip_search_tags":[],"duration_seconds":6}`;

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

// ─── Post-process: apply style lock, IDs, defaults ──────────────────────────

function postProcessScenes(scenes, defaults = {}) {
  const style = defaults.style || {};
  return validateAndGroundPrompts(scenes).map((scene, i) => {
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

    return {
      ...scene,
      scene_id:          String(i + 1).padStart(3, '0'),
      style_lock:        STYLE_LOCK,
      subject_anchors:   scene.subject_anchors  || [],
      composition:       scene.composition      || 'medium',
      motion:            scene.shot_type === 'image'
        ? (scene.motion || { type: style.motionType || 'push_in', intensity: 'subtle' })
        : null,
      overlays:          [],
      transition_out:         scene.transition_out || style.transition || 'dissolve',
      grade:                  scene.shot_type === 'image' ? (scene.grade || style.grade || 'cool_blue') : null,
      letterbox:              scene.shot_type !== 'motion_graphic',
      duration_seconds:       scene.duration_seconds || style.durationSeconds || 5,
      audio_cut:              scene.audio_cut              || 'hard',
      audio_overlap_seconds:  Number(scene.audio_overlap_seconds) || 0,
      higgsfield_prompt: finalPrompt,
      real_footage_flag: scene.shot_type === 'real_footage',
      clip_search_tags:  scene.clip_search_tags || [],
    };
  });
}

// ─── Primary analysis attempt ────────────────────────────────────────────────

async function attemptAnalysis(script, metadata, defaults) {
  const client = new Anthropic();

  const userMessage = `VIDEO TITLE: ${metadata.title || 'Untitled'}
NICHE: ${metadata.niche || 'General'}
STYLE PRESET: ${metadata.stylePreset || 'Dark Cinematic'}
NARRATOR TONE: ${metadata.narratorTone || 'Authoritative'}

SCRIPT:
${script}

Analyze the full script and return the complete scenes array.
REMINDER: Maximum 20 scenes. Keep all field values compact (see COMPACT JSON RULES).`;

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 16000,
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

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 16000,
    messages:   [{
      role:    'user',
      content: `Analyze this documentary script and return a JSON array of scenes.

Script: ${script.slice(0, 4000)}

Return ONLY a valid JSON array. Maximum 15 scenes. Each scene object needs ONLY these fields:
- scene_id (string, zero-padded: "001")
- shot_type ("image" | "motion_graphic" | "real_footage")
- script_excerpt (max 20 words, complete sentence)
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

module.exports = { analyzeScript, callClaude }
