const Anthropic = require('@anthropic-ai/sdk');

const STYLE_LOCK = 'dark cinematic 4K shallow depth of field slow dolly movement documentary aesthetic muted tones';

const SYSTEM_PROMPT = `You are a video production scene analyzer. Given a documentary script and project metadata, you break the script into discrete visual scenes and assign full composition metadata for each one.

For each scene return one of three shot types:
- "image" — AI-generated still with motion animation. Use for atmosphere, specific moments, historical events.
- "motion_graphic" — Animated Remotion component. Use ONLY for statistics, charts, timelines, comparisons, or geographic data.
- "real_footage" — Stock/library clip match. Use when the scene describes recognizable real-world events, places, or public figures.

═══ PROMPT GROUNDING RULES ═══

Every higgsfield_prompt must be grounded in the specific subject of the video.

1. SUBJECT ANCHORING — Every image prompt must reference the actual subject. If the video is about Apple, every prompt must mention Apple products, Steve Jobs, Cupertino, specific devices, or real events. Never substitute a generic stand-in.
2. SCRIPT ANCHORING — Describe what is literally happening in the script excerpt, not a thematic interpretation.
3. SPECIFICITY — Use real place names, real years, real product names, real people described by physical appearance and role.
4. BANNED WORDS — Never use: businessman, businesswoman, office, technology, modern, futuristic, abstract, concept, idea, success, growth, innovation, digital, corporate, professional. Go one level deeper into the specific subject.
5. SUBJECT ANCHORS — Extract 3–6 specific real-world entities per scene. At least 2 must be directly referenced in the higgsfield_prompt.

═══ MOTION (image scenes only) ═══

Assign motion.type and motion.intensity for every image scene:
- push_in: building tension, revealing information, approaching a subject
- pull_out: revealing scale, showing consequences, stepping back from a moment
- drift_left / drift_right: establishing shots, locations, crowds, timelines
- drift_up: aspirational moments, launches, achievements, growth
- static: death, failure, shock, gravity — stillness has more impact than movement

intensity:
- subtle: background/context scenes
- moderate: main narrative scenes
- strong: climax, turning points, key revelations

═══ OVERLAYS (image scenes only) ═══

Rules:
- Add lower_third when a specific person, company, or product is introduced for the FIRST TIME in the script. Use line1 for the name/title, line2 for role/context/year.
- Add date_stamp when a specific year, date, or location is mentioned in the excerpt.
- NEVER add both lower_third and date_stamp to the same scene — pick the more relevant one.
- Leave overlays: [] for abstract or atmospheric scenes.
- Add kinetic_text for a single punchy declarative statement (stat, quote fragment, turning point). Maximum 8 words. Maximum 1 in every 4 image scenes — use sparingly.

Overlay types:
  { "type": "lower_third", "line1": "Steve Jobs", "line2": "Apple CEO · 1997" }
  { "type": "date_stamp", "text": "Cupertino · 1997" }
  { "type": "kinetic_text", "text": "$0 to $3 trillion", "style": "center" }

═══ TRANSITION OUT ═══

Assign transition_out for every scene (image, motion_graphic, real_footage):
- dissolve: default for most scenes — smooth cross-fade
- cut: after static motion scenes, fast pacing moments, urgent sequences
- dip_black: chapter breaks, time jumps of 5+ years, deaths, endings, dramatic pauses
- dip_white: memory sequences, product reveals, breakthrough moments, hope

═══ COLOR GRADE (image scenes only) ═══

Assign grade for every image scene:
- cool_blue: default, works for most documentary content
- warm_amber: historical footage, nostalgia, past events
- desaturated: dark subjects, corporate failure, crisis, bleak moments
- neutral: product shots, clean reveals, present-day context

═══ FIELD RULES ═══

- Generate 8–15 scenes for a typical script
- scene_id: zero-padded three digits: "001", "002", etc.
- script_excerpt: 1–2 sentences maximum
- duration_seconds: 4–8 based on excerpt length
- higgsfield_prompt: vivid, specific visual description for image and real_footage scenes. Do NOT include any style lock text.
- subject_anchors: array of 3–6 specific real-world entities from the script excerpt
- motion_graphic_type: one of AnimatedCounter | TimelineBar | ComparisonChart | QuoteCard | MapHighlight (motion_graphic only)
- clip_search_tags: 3–6 lowercase tags for real_footage scenes, empty array otherwise
- real_footage_flag: true only for real_footage scenes

Return ONLY a raw JSON array. No markdown fences, no explanation, no wrapper object.

Example element (Apple iPhone launch video):
{"scene_id":"001","script_excerpt":"In January 2007, Steve Jobs walked onto the Macworld stage and changed everything.","shot_type":"image","mood":"anticipatory","higgsfield_prompt":"Steve Jobs in black mock turtleneck and jeans walking onto the Macworld Expo 2007 stage at San Francisco Moscone Center, packed audience of thousands, blue spotlight, giant iPhone banner","subject_anchors":["Steve Jobs","Macworld Expo 2007","iPhone announcement","San Francisco Moscone Center"],"motion":{"type":"push_in","intensity":"strong"},"overlays":[{"type":"lower_third","line1":"Steve Jobs","line2":"Apple CEO · San Francisco 2007"}],"transition_out":"dissolve","grade":"cool_blue","motion_graphic_type":"","style_lock":"","real_footage_flag":false,"clip_search_tags":[],"duration_seconds":6}`;

// Post-process: verify every image/real_footage prompt contains at least one subject anchor word.
// If not, append the top anchor automatically.
function validateAndGroundPrompts(scenes) {
  return scenes.map(scene => {
    if (scene.shot_type !== 'image' && scene.shot_type !== 'real_footage') return scene
    if (!scene.higgsfield_prompt || !scene.subject_anchors?.length) return scene

    const promptLower = scene.higgsfield_prompt.toLowerCase()
    const anchorWords = scene.subject_anchors
      .flatMap(a => a.toLowerCase().split(/\s+/))
      .filter(w => w.length > 3)

    const hasAnchor = anchorWords.some(w => promptLower.includes(w))

    if (!hasAnchor) {
      const topAnchor = scene.subject_anchors[0]
      console.warn(`[claude] scene ${scene.scene_id}: prompt not grounded — appending "${topAnchor}"`)
      return { ...scene, higgsfield_prompt: `${scene.higgsfield_prompt}, ${topAnchor}` }
    }

    return scene
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
  const scenes = JSON.parse(raw)

  const style = defaults.style || {}

  const processed = scenes.map((scene, i) => ({
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
    higgsfield_prompt:
      scene.shot_type === 'image' || scene.shot_type === 'real_footage'
        ? `${scene.higgsfield_prompt}, ${STYLE_LOCK}`
        : '',
    real_footage_flag: scene.shot_type === 'real_footage',
    clip_search_tags:  scene.clip_search_tags || [],
  }))

  return validateAndGroundPrompts(processed)
}

module.exports = { analyzeScript }
