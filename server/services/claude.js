const Anthropic = require('@anthropic-ai/sdk');
const { randomUUID } = require('crypto');

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

OVERLAY GENERATION RULES

For every scene, analyze the script excerpt and generate an overlays array.
Apply these rules strictly:

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

KINETIC TEXT rules:
- Add kinetic_text for a single punchy declarative statement that carries narrative weight
- Use sparingly — maximum 1 in every 4 scenes across the whole video
- Examples: "The most valuable company in human history" / "90 days from bankruptcy"
- Never duplicate kinetic_text and stat_callout on the same scene

CHAPTER TITLE rules:
- Insert a chapter_title overlay on scenes that mark major narrative transitions (new era, new phase, new subject)
- text.line1 = "Chapter N", text.line2 = short evocative title (e.g. "The Fall")
- Maximum 3-5 across a full documentary
- Chapter title scenes should have no other overlays

BACKGROUND OVERLAY rules:
- Add background_overlay (template "gradient_bottom") to any scene where text overlays need legibility help
- Background overlays can combine with any other overlay type

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
    "reason": "First mention of Steve Jobs in the script",
    "status": "suggested"
  }
]

- "status" must always be "suggested" — never "accepted"
- "template" must use the template name provided in the user message for that overlay type
- "confidence" is 0.0–1.0 — how certain you are this overlay is appropriate
- "reason" is a plain English explanation of why you added this overlay
- Leave overlays: [] for purely atmospheric or action scenes with no named subjects, stats, or key locations

STING PLACEMENT RULES

Add use_sting: true when:
- The scene marks a major narrative turning point (company collapses, product launches, shocking revelation)
- transition_out is dip_black or dip_white
- The scene introduces a new chapter or major time period shift

Add use_sting: false when:
- Regular B-roll or context-setting scenes
- use_sting was true in either of the previous 2 scenes (never back-to-back)
- The scene is one of a sequence of similar content scenes

Default to false — stings must be sparse and meaningful. Maximum 1 in every 3 consecutive scenes.

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

  const overlayTemplates = defaults.overlayTemplates || {}
  const templateContext = `USER DEFAULT TEMPLATES:
- lower_third template: ${overlayTemplates.lower_third || 'minimal_line'}
- date_stamp template: ${overlayTemplates.date_stamp || 'minimal_pill'}
- kinetic_text template: ${overlayTemplates.kinetic_text || 'center_impact'}
- stat_callout template: ${overlayTemplates.stat_callout || 'big_number'}
- chapter_title template: ${overlayTemplates.chapter_title || 'minimal_chapter'}
- background_overlay template: ${overlayTemplates.background_overlay || 'gradient_bottom'}`

  const userMessage = `VIDEO TITLE: ${metadata.title || 'Untitled'}
NICHE: ${metadata.niche || 'General'}
STYLE PRESET: ${metadata.stylePreset || 'Dark Cinematic'}
NARRATOR TONE: ${metadata.narratorTone || 'Authoritative'}

${templateContext}

ENTITIES ALREADY INTRODUCED: []
(This is the first scene — no entities introduced yet)

SCRIPT:
${script}

Analyze the full script and return the complete scenes array.
Track entity introductions across all scenes — each named person or company gets a lower_third only once.`

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

    // Ensure every overlay has a stable ID so the review UI can accept/reject individually
    const overlaysWithIds = (scene.overlays || []).map(o => ({
      id: o.id || randomUUID(),
      ...o,
    }))

    return {
      ...scene,
      scene_id: String(i + 1).padStart(3, '0'),
      style_lock: STYLE_LOCK,
      subject_anchors:  scene.subject_anchors  || [],
      motion:           scene.shot_type === 'image'
        ? (scene.motion || { type: style.motionType || 'push_in', intensity: 'subtle' })
        : null,
      overlays:         overlaysWithIds,
      transition_out:   scene.transition_out || style.transition || 'dissolve',
      grade:            scene.shot_type === 'image' ? (scene.grade || style.grade || 'cool_blue') : null,
      duration_seconds: scene.duration_seconds || style.durationSeconds || 5,
      higgsfield_prompt: finalPrompt,
      real_footage_flag: scene.shot_type === 'real_footage',
      clip_search_tags:  scene.clip_search_tags || [],
      use_sting:         scene.use_sting === true,
    }
  })

  return processed
}

module.exports = { analyzeScript }
