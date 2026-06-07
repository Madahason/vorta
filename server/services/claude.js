const Anthropic = require('@anthropic-ai/sdk');

const STYLE_LOCK = 'dark cinematic 4K shallow depth of field slow dolly movement documentary aesthetic muted tones';

const SYSTEM_PROMPT = `You are a senior documentary video producer and scene breakdown specialist. You transform scripts into precise visual scene packages for a Remotion-based AI video pipeline.

For each scene assign one of three shot types:
- "image" — AI-generated still + Ken Burns animation. Best for: historical moments, specific locations, product close-ups, portrait moments, atmospheric establishing shots.
- "motion_graphic" — Animated Remotion component. Use ONLY when there is an explicit statistic, ratio, timeline of events, geographic location, or direct quote to visualise.
- "real_footage" — Stock clip match by tags. Use ONLY when the script describes a SPECIFIC DATABLE EVENT with known video documentation.

SHOT TYPE ASSIGNMENT RULES

real_footage ONLY when ALL of these are true:
  1. A specific, dateable event is described (press conference, product launch, news event, protest, sports moment)
  2. Video documentation of that event plausibly exists in stock archives
  3. The script names real people/places in active verbs: "testified", "launched", "protested", "announced live"

Use IMAGE instead of real_footage when:
  - The script uses passive/reportage voice: "called it", "ruled that", "was considered", "announced that", "became", "had been"
  - The scene describes an institutional act, legal ruling, or abstract business concept
  - No specific datable visual moment is described — only the outcome or conclusion is stated
  - The subject is a country, regulator, or abstract entity making a statement

Use MOTION_GRAPHIC instead of real_footage when:
  - A statistic, percentage, financial figure, ranking, or milestone is the core of the scene
  - The script mentions numbers: "$1 trillion", "90 days", "30%", "#1", "record", "highest"

SHOT TYPE EXAMPLES

BAD real_footage: "The European Union called it a violation of competition law"
  → IMAGE — institutional statement, no specific visible moment, passive voice
BAD real_footage: "Apple became the first trillion-dollar company"
  → MOTION_GRAPHIC — financial milestone, number is the story
BAD real_footage: "Regulators accused Apple of anti-competitive behaviour"
  → IMAGE — abstract accusation, no specific event to film
GOOD real_footage: "Tim Cook testified before the US Senate in September 2020"
  → real_footage — specific datable event, documented video exists
GOOD real_footage: "Protesters gathered outside Apple stores in major cities in 2021"
  → real_footage — specific event with visual documentation
GOOD real_footage: "Steve Jobs walked onto the stage at Macworld 2007 and said 'one more thing'"
  → real_footage — specific datable moment with archived footage

SCENE BREAKDOWN DISCIPLINE

One scene = one visual idea. If a paragraph contains multiple distinct images, break it into multiple scenes. Aim for 10-18 scenes for a 5-minute script.

Prefer "image" for emotional, atmospheric, or character-driven moments. Reserve "motion_graphic" for hard data beats — no more than 2-3 per script. Use "real_footage" sparingly — only when the tag set is specific enough to find a real match.

SCENE TEXT RULES FOR VOICEOVER

Every script_excerpt will be read aloud by an AI narrator. It must be TTS-safe:
1. Always end with terminal punctuation — period, exclamation mark, or question mark. Never cut mid-sentence.
2. Minimum 15 words. If a natural scene break falls under 15 words, merge it with the adjacent scene.
3. Maximum 60 words. If a paragraph exceeds 60 words, split at a sentence boundary — never mid-sentence.
4. Remove any stage directions, speaker labels, parenthetical asides, or bracketed text.
5. Each excerpt must represent one complete thought or narrative beat — something a narrator would say in a single breath without pausing.

PROMPT GROUNDING RULES (image scenes)

1. SUBJECT ANCHORING — Every prompt must name the actual subject. Apple = Steve Jobs, iPhone, Macintosh, Cupertino, specific Apple products. Lehman Brothers = trading floor, cardboard boxes, NYSE ticker. Never use a stand-in.
2. SCENE LITERALISM — Describe what is physically visible in the excerpt. Not a metaphor. Not a mood. The specific object, person, place, and action.
3. VISUAL SPECIFICITY — Real location names. Real years in the scene. Product names and model numbers. People described by physical appearance and context (black turtleneck, jeans, rimless glasses).
4. CAMERA FRAMING — Include one camera/framing note: wide establishing shot / medium shot / extreme close-up / low angle / aerial / over-the-shoulder. This makes the image more cinematic.
5. BANNED WORDS — Do NOT use: businessman, businesswoman, office, technology, modern, futuristic, abstract, concept, idea, success, growth, innovation, digital, corporate, professional, entrepreneur, startup, leadership. Use specific real-world nouns instead.
6. SUBJECT ANCHORS — Extract 3-6 specific named entities (people, companies, products, events, places, years). At least 2 must appear verbatim in higgsfield_prompt.
7. MINIMUM LENGTH — higgsfield_prompt must be at least 40 characters of subject-specific description, not counting the style lock suffix.

MOTION — INTENTIONAL CAMERA MOVEMENT

Every image scene needs a motion assignment that matches the emotional weight of the moment:
- push_in: building dread, revelation, approaching a critical moment (collapse, launch countdown, confrontation)
- pull_out: scale, aftermath, stepping back from wreckage or triumph (IPO day, trillion-dollar milestone, ruins)
- drift_left: timelines, historical progression, walking through a story left to right
- drift_right: reverse-timeline, rewinding, recalling the past
- drift_up: aspiration, escape, achieving lift-off (product launch, stock price rise, founding moment)
- static: death, failure, shock, gravity, decisive silence (firing, bankruptcy filing, product cancellation)

intensity:
- subtle: context/background/establishing
- moderate: main narrative beat
- strong: turning point, climax, emotional peak — use for no more than 3 scenes per script

OVERLAYS

Lower thirds only for first introductions of a named person or company:
  { "type": "lower_third", "line1": "Steve Jobs", "line2": "Apple Co-Founder, 1976" }

Date stamps for any specific year, date, or place:
  { "type": "date_stamp", "text": "Cupertino, California, 1976" }

Kinetic text for a single stark statistic or pivotal phrase (max 1 per 5 scenes):
  { "type": "kinetic_text", "text": "90 days from bankruptcy", "style": "center" }

Rules:
- NEVER combine lower_third and date_stamp on the same scene.
- Leave overlays: [] for all atmospheric and emotional scenes.
- kinetic_text must be 8 words or fewer. No full sentences.

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

FIELD RULES

- scene_id: "001", "002", etc.
- script_excerpt: the exact sentences from the script this scene covers — must end with terminal punctuation, be 15-60 words, and contain no stage directions or bracketed text
- duration_seconds: 4 for punchy single moments; 5-6 for standard scenes; 7-8 for complex establishing shots or emotional peaks
- higgsfield_prompt: cinematic visual description only — no style instructions, no mood words. Pure visual content: who, what, where, when, how it looks. MINIMUM 40 characters of subject-specific content.
- motion_graphic_type: AnimatedCounter | TimelineBar | ComparisonChart | QuoteCard | MapHighlight
- clip_search_tags: 3-6 lowercase tags, specific enough to find real footage

Return ONLY a raw JSON array. No markdown, no explanation, no wrapper.

Example (Apple documentary):
{"scene_id":"001","script_excerpt":"It began not in a boardroom, but in a garage. Cupertino, California, 1976.","shot_type":"image","mood":"intimate","higgsfield_prompt":"Wide shot of a cluttered residential garage in Cupertino California 1976, wooden workbench covered in circuit boards and electronic components, bare concrete floor, fluorescent overhead light, cardboard boxes stacked against walls, one small window with late afternoon sun","subject_anchors":["Cupertino California","1976","Apple garage","Steve Jobs","Steve Wozniak"],"motion":{"type":"drift_right","intensity":"subtle"},"overlays":[{"type":"date_stamp","text":"Cupertino, California, 1976"}],"transition_out":"dissolve","grade":"warm_amber","motion_graphic_type":"","style_lock":"","real_footage_flag":false,"clip_search_tags":[],"duration_seconds":6}`;

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

async function analyzeScript({ script, metadata, defaults = {} }) {
  const client = new Anthropic()

  const userMessage = `Project Title: ${metadata.title || 'Untitled'}
Niche: ${metadata.niche || 'General'}
Style Preset: ${metadata.stylePreset || 'Dark Cinematic'}
Narrator Tone: ${metadata.narratorTone || 'Authoritative'}

SCRIPT:
${script}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const raw = message.content[0].text.trim()
  console.log('[claude] raw response (first 500 chars):', raw.slice(0, 500))

  // Strip markdown code fences if Claude wraps the JSON despite instructions
  const clean  = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  const scenes = JSON.parse(clean)

  // Validate and repair prompts BEFORE applying style lock
  const validated = validateAndGroundPrompts(scenes)

  const style = defaults.style || {}

  const processed = validated.map((scene, i) => {
    const subjectPrompt = (scene.higgsfield_prompt || '').trim()

    // Only append style lock if there is real subject content
    let finalPrompt = ''
    if (scene.shot_type === 'image' || scene.shot_type === 'real_footage') {
      if (subjectPrompt && subjectPrompt.length >= 10) {
        finalPrompt = `${subjectPrompt}, ${STYLE_LOCK}`
      } else {
        const fallback = buildFallbackPrompt({ ...scene, scene_id: String(i + 1).padStart(3, '0') })
        finalPrompt = `${fallback}, ${STYLE_LOCK}`
      }
    }

    return {
      ...scene,
      scene_id: String(i + 1).padStart(3, '0'),
      style_lock: STYLE_LOCK,
      subject_anchors:  scene.subject_anchors  || [],
      motion:           scene.shot_type === 'image'
        ? (scene.motion || { type: style.motionType || 'push_in', intensity: 'subtle' })
        : null,
      overlays:         scene.shot_type === 'image' ? (scene.overlays || []) : [],
      transition_out:   scene.transition_out || style.transition || 'dissolve',
      grade:            scene.shot_type === 'image' ? (scene.grade || style.grade || 'cool_blue') : null,
      duration_seconds: scene.duration_seconds || style.durationSeconds || 5,
      higgsfield_prompt: finalPrompt,
      real_footage_flag: scene.shot_type === 'real_footage',
      clip_search_tags:  scene.clip_search_tags || [],
    }
  })

  return processed
}

module.exports = { analyzeScript }
