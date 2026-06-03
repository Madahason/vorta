const Anthropic = require('@anthropic-ai/sdk');

const STYLE_LOCK = 'dark cinematic 4K shallow depth of field slow dolly movement documentary aesthetic muted tones';

const SYSTEM_PROMPT = `You are a video production scene analyzer. Given a documentary script and project metadata, you break the script into discrete visual scenes.

For each scene return one of three shot types:
- "image" — AI-generated still with Ken Burns animation. Use for atmosphere, abstract concepts, historical moments without available footage.
- "motion_graphic" — Animated Remotion component. Use ONLY for statistics, charts, timelines, comparisons, or geographic data.
- "real_footage" — Stock/library clip match. Use when the scene describes recognizable real-world events, places, or public figures.

Rules:
- Generate 8–15 scenes for a typical script
- scene_id is zero-padded three digits: "001", "002", etc.
- script_excerpt is 1–2 sentences maximum
- duration_seconds is 4–8 based on excerpt length
- higgsfield_prompt: write a vivid visual description for image and real_footage scenes. Do NOT include any style lock text — the system injects it automatically.
- motion_graphic_type: one of AnimatedCounter | TimelineBar | ComparisonChart | QuoteCard | MapHighlight (only for motion_graphic scenes)
- clip_search_tags: 3–6 lowercase tag strings for real_footage scenes, empty array otherwise
- real_footage_flag: true only for real_footage scenes

Return ONLY a raw JSON array. No markdown fences, no explanation, no wrapper object.

Example element:
{"scene_id":"001","script_excerpt":"The moment Lehman collapsed, the world held its breath.","shot_type":"image","mood":"tense","higgsfield_prompt":"Cinematic aerial view of empty Wall Street at dawn, 2008, dark moody grade","motion_graphic_type":"","style_lock":"","real_footage_flag":false,"clip_search_tags":[],"duration_seconds":5}`;

async function analyzeScript({ script, metadata }) {
  const client = new Anthropic();

  const userMessage = `Project Title: ${metadata.title || 'Untitled'}
Niche: ${metadata.niche || 'General'}
Style Preset: ${metadata.stylePreset || 'Dark Cinematic'}
Narrator Tone: ${metadata.narratorTone || 'Authoritative'}

SCRIPT:
${script}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = message.content[0].text.trim();
  const scenes = JSON.parse(raw);

  return scenes.map((scene, i) => ({
    ...scene,
    scene_id: String(i + 1).padStart(3, '0'),
    style_lock: STYLE_LOCK,
    higgsfield_prompt:
      scene.shot_type === 'image' || scene.shot_type === 'real_footage'
        ? `${scene.higgsfield_prompt}, ${STYLE_LOCK}`
        : '',
    real_footage_flag: scene.shot_type === 'real_footage',
    clip_search_tags: scene.clip_search_tags || [],
  }));
}

module.exports = { analyzeScript };
