const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadToBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Only called with user-selected references (1-3 items) — never call this with the
// full search/browse result set, to avoid unnecessary downloads and vision API cost.
async function analyzeThumbnailPatterns(referenceImages) {
  const client = new Anthropic();

  const imageBlocks = [];
  const downloadResults = await Promise.allSettled(
    referenceImages.map(async (ref) => {
      const buf = await downloadToBuffer(ref.url);
      return { title: ref.title, base64: buf.toString('base64'), mediaType: 'image/jpeg' };
    })
  );

  for (const r of downloadResults) {
    if (r.status === 'fulfilled') imageBlocks.push(r.value);
    else console.warn('[analyzeThumbnailPatterns] download failed:', r.reason?.message);
  }

  if (imageBlocks.length === 0) throw new Error('All reference image downloads failed');

  const content = [];
  for (const img of imageBlocks) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    });
    content.push({ type: 'text', text: `(Title: "${img.title}")` });
  }
  content.push({
    type: 'text',
    text: `Analyze the visual PATTERNS COMMON ACROSS all ${imageBlocks.length} reference thumbnails above. These are real YouTube thumbnails from the same niche.

CRITICAL RULES:
- Describe patterns that appear ACROSS the set, not per-image breakdowns
- NEVER describe any single image in isolated, reproducible detail
- Synthesize a general pattern description usable as creative direction for generating a NEW, ORIGINAL thumbnail
- Focus on: dominant color palette, typical subject placement, typography style, overall mood/tone, use of contrast/dramatic lighting, composition patterns
- This output will inform an AI image generator — it must describe a STYLE, not copy any specific image

Return valid JSON only:
{"dominantPalette":"describe the 3-4 most common colors/tones across the set","subjectPlacementPattern":"where subjects typically appear — left/right/center, how much frame they occupy","typographyStyle":"common text treatment — font weight, color, placement, stroke/shadow patterns","moodDescriptor":"2-3 words capturing the overall emotional register","compositionNotes":"any other recurring visual patterns — lighting direction, background treatment, framing"}`,
  });

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: 'You are a visual design analyst. Analyze patterns across multiple reference images to extract general style direction. Never describe individual images in isolation. Return only valid JSON.',
    messages: [{ role: 'user', content }],
  });

  const text = resp.content.find(b => b.type === 'text')?.text || '';
  return parseClaudeJson(text);
}

async function generateThumbnailPrompt(idea, angle, title, styleMode, referencePatterns) {
  const client = new Anthropic();

  const autoSelectBlock = styleMode
    ? `Use this style mode: ${styleMode}`
    : `Auto-select the best style mode from the list below based on the idea, angle, and niche context. Return the selected mode in the "styleMode" field.`;

  let referenceBlock = '';
  if (referencePatterns) {
    referenceBlock = `
REFERENCE PATTERN CONTEXT — model the visual treatment after these observed patterns from real high-performing thumbnails in this niche (combine with, do not override, the mandatory composition rules below):
- Dominant palette: ${referencePatterns.dominantPalette || 'not specified'}
- Subject placement pattern: ${referencePatterns.subjectPlacementPattern || 'not specified'}
- Typography style: ${referencePatterns.typographyStyle || 'not specified'}
- Mood: ${referencePatterns.moodDescriptor || 'not specified'}
- Composition notes: ${referencePatterns.compositionNotes || 'not specified'}
`;
  }

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
${referenceBlock}
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

module.exports = { generateThumbnailPrompt, analyzeThumbnailPatterns, VALID_STYLE_MODES };
