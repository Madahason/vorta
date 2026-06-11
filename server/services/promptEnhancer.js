const { callClaude } = require('./claude');

const BANNED_WORDS = [
  'businessman', 'corporate', 'modern', 'futuristic', 'abstract',
  'technology', 'professional', 'success', 'growth', 'innovation',
  'digital', 'concept', 'office worker', 'suit and tie', 'generic',
];

const COMPOSITION_TEMPLATES = {
  close_up:     'extreme close-up, subject fills frame, shallow depth of field',
  medium:       'medium shot, subject centered on left third, background visible',
  wide:         'wide establishing shot, subject small in frame, environment dominant',
  aerial:       'aerial top-down view, looking directly down, high altitude perspective',
  low_angle:    'low angle looking up, subject towers against sky or ceiling',
  over_shoulder:'over-shoulder shot, subject seen from behind, facing scene',
};

const STYLE_LOCK = 'dark cinematic 4K shallow depth of field slow dolly movement documentary aesthetic muted tones';

function hasBannedWords(prompt) {
  const lower = prompt.toLowerCase();
  return BANNED_WORDS.filter(word => lower.includes(word));
}

function hasCompositionLanguage(prompt) {
  const terms = ['shot', 'angle', 'close-up', 'wide', 'aerial',
    'medium', 'rule of thirds', 'looking up', 'looking down', 'over-shoulder'];
  const lower = prompt.toLowerCase();
  return terms.some(t => lower.includes(t));
}

function hasLightingLanguage(prompt) {
  const terms = ['light', 'lighting', 'spotlight', 'fluorescent',
    'backlight', 'glow', 'shadow', 'illuminat', 'dark', 'bright'];
  const lower = prompt.toLowerCase();
  return terms.some(t => lower.includes(t));
}

function hasStyleLock(prompt) {
  return prompt.includes('cinematic') && prompt.includes('documentary');
}

function extractYear(text) {
  const match = (text || '').match(/\b(19[0-9]{2}|20[0-2][0-9])\b/);
  return match ? parseInt(match[1]) : null;
}

// Fast enhancement — adds missing elements without a Claude call
function quickEnhance(prompt, scene) {
  let enhanced = prompt;
  const composition = scene?.composition || 'medium';

  // Remove banned words
  hasBannedWords(enhanced).forEach(word => {
    enhanced = enhanced.replace(new RegExp(word, 'gi'), '');
  });

  // Add composition language if missing
  if (!hasCompositionLanguage(enhanced)) {
    const compText = COMPOSITION_TEMPLATES[composition] || COMPOSITION_TEMPLATES.medium;
    enhanced = `${compText}, ${enhanced}`;
  }

  // Add lighting language if missing
  if (!hasLightingLanguage(enhanced)) {
    const year = extractYear(scene?.script_excerpt);
    const lighting = year && year < 2000
      ? 'harsh fluorescent office lighting'
      : year && year < 2010
        ? 'cold blue monitor light casting shadows'
        : 'directional overhead spotlight';
    enhanced = `${enhanced}, ${lighting}`;
  }

  // Ensure style lock at end
  if (!hasStyleLock(enhanced)) {
    enhanced = `${enhanced}, ${STYLE_LOCK}`;
  }

  return enhanced.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
}

// Full Claude enhancement — for prompts that need significant improvement
async function claudeEnhance(prompt, scene) {
  const anchors     = scene?.subject_anchors || [];
  const composition = scene?.composition     || 'medium';
  const excerpt     = scene?.script_excerpt  || '';

  const enhancePrompt = `You are a documentary cinematographer rewriting a Higgsfield image prompt.

Original prompt: "${prompt}"
Scene excerpt: "${excerpt}"
Subject anchors: ${JSON.stringify(anchors)}
Required composition: ${composition}

Rewrite this prompt to be cinematographically specific. Requirements:
1. Start with composition: "${COMPOSITION_TEMPLATES[composition] || COMPOSITION_TEMPLATES.medium}"
2. Include specific lighting type (not just "dark" or "moody")
3. Include one period-accurate environmental detail if a year is referenced
4. Include one specific atmospheric physical detail (dust, rain, steam, papers, etc.)
5. Keep all subject-specific details from the original
6. Remove any banned generic words (businessman, corporate, modern, technology, professional, success, digital)
7. End with: "${STYLE_LOCK}"
8. Maximum 70 words total

Return ONLY the rewritten prompt. No explanation.`;

  try {
    const enhanced = await callClaude(
      enhancePrompt,
      'You are a cinematographer. Return only the rewritten prompt, nothing else.'
    );
    return enhanced.trim().replace(/^["']|["']$/g, '');
  } catch {
    return quickEnhance(prompt, scene);
  }
}

// Main entry point — called per scene before Higgsfield generation
async function enhancePrompt(scene, useClaudeForWeak = true) {
  const prompt = scene?.higgsfield_prompt || '';
  if (!prompt) return prompt;

  const banned            = hasBannedWords(prompt);
  const missingComposition = !hasCompositionLanguage(prompt);
  const missingLighting    = !hasLightingLanguage(prompt);
  const isWeak             = banned.length > 0 || missingComposition || missingLighting;

  if (!isWeak && hasStyleLock(prompt)) {
    return prompt; // already good — skip all enhancement
  }

  if (isWeak && useClaudeForWeak) {
    console.log(`[promptEnhancer] Claude-enhancing weak prompt for scene ${scene?.scene_id}`);
    return await claudeEnhance(prompt, scene);
  }

  return quickEnhance(prompt, scene);
}

// Batch — enhance all image scenes (used by /api/generate/enhance-prompts)
async function enhanceAllPrompts(scenes) {
  const enhanced = [];
  for (const scene of scenes) {
    if (scene.shot_type !== 'image') {
      enhanced.push(scene);
      continue;
    }
    const improvedPrompt = await enhancePrompt(scene, true);
    if (improvedPrompt !== scene.higgsfield_prompt) {
      console.log(`[promptEnhancer] enhanced scene ${scene.scene_id}`);
    }
    enhanced.push({ ...scene, higgsfield_prompt: improvedPrompt });
  }
  return enhanced;
}

module.exports = { enhancePrompt, enhanceAllPrompts, quickEnhance };
