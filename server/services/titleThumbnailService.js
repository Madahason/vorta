const Anthropic = require('@anthropic-ai/sdk');

const VALID_STYLE_MODES = [
  'curiosity_gap',
  'stat_driven',
  'face_or_figure',
  'object_icon',
  'before_after',
  'scene_dramatization',
];

function parseClaudeJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      return JSON.parse(stripped);
    } catch {
      const match = stripped.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Claude returned invalid JSON');
    }
  }
}

async function generateThumbnailPrompt(idea, angle, title, styleMode) {
  const client = new Anthropic();

  const autoSelectBlock = styleMode
    ? `Use this style mode: ${styleMode}`
    : `Auto-select the best style mode from the list below based on the idea, angle, and niche context. Return the selected mode in the "styleMode" field.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: 'You are a YouTube thumbnail art director. You write Higgsfield image generation prompts optimized for YouTube thumbnail composition. Return only valid JSON. No markdown fences, no preamble.',
    messages: [{
      role: 'user',
      content: `Write a Higgsfield image generation prompt for a YouTube thumbnail.

VIDEO IDEA: ${idea}
ANGLE: ${angle}
TITLE: ${title}

${autoSelectBlock}

STYLE MODES (pick one):
- curiosity_gap: true crime, mystery, investigative, legal — obscured/partial subject, shadow, single dramatic light source
- stat_driven: finance, business, data-heavy — bold number/chart as dominant visual, minimal scene
- face_or_figure: a real named person is central — person rendered prominently in one third, expression-driven
- object_icon: tech/product stories — product/symbol as hero subject, clean studio-style background
- before_after: transformation, rise-and-fall — split composition contrasting two states
- scene_dramatization: historical/narrative moments — specific dramatized real-world moment, cinematic treatment

MANDATORY COMPOSITION RULES — these must appear as LITERAL INSTRUCTION TEXT in the prompt:
1. Subject placed in the LEFT or RIGHT third of the frame, NEVER dead center
2. The opposite third must be clean negative space with a simple or blurred background, reserved for text overlay
3. High contrast and strong tonal separation between subject and background — must read clearly at small mobile thumbnail size
4. Nothing critical placed in the bottom-right corner (YouTube duration badge overlaps that zone)
5. 16:9 aspect ratio, cinematic lighting appropriate to the style mode

Return this exact JSON:
{"prompt":"the full Higgsfield prompt string","styleMode":"one of the 6 modes above"}`,
    }],
  });

  const text = message.content[0].text.trim();
  const parsed = parseClaudeJson(text);

  const prompt = parsed.prompt || '';
  const resolvedMode = VALID_STYLE_MODES.includes(parsed.styleMode) ? parsed.styleMode : 'scene_dramatization';

  if (!prompt) throw new Error('Claude returned empty prompt');

  return { prompt, styleMode: resolvedMode };
}

module.exports = { generateThumbnailPrompt, VALID_STYLE_MODES };
