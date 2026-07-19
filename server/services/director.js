// DD-1: Documentary Director — whole-film treatment generation.
//
// One Claude call over the FULL script produces the director's treatment: the unifying
// creative plan (visual signature, continuity entities, motifs, acts, evidence claims) that
// every later per-scene stage (DD-2..DD-5) builds from. This service does NOT break the
// script into scenes — that remains the job of analyzeScript in services/claude.js, which
// is untouched by this phase.

const Anthropic = require('@anthropic-ai/sdk');

const TREATMENT_SYSTEM_PROMPT = `You are an experienced documentary director working in the style of premium
YouTube documentary channels — restrained, investigative, evidence-led.

You will read an entire script and produce a DIRECTOR'S TREATMENT: the
unifying creative plan that every individual scene will later be built from.

You are NOT breaking the script into scenes. That happens later. Your job is
to understand the whole film first.

CORE PRINCIPLE:
The visual direction must emerge from THIS script's subject and argument.
Never apply a default aesthetic. A film about 1970s shipping logistics and a
film about a 2024 crypto collapse must not receive the same visual treatment.

VISUAL SIGNATURE — most important field:
Produce ONE compact clause, maximum 15 words, that will be appended to every
AI image prompt in this documentary. It must cover: colour grade + focus
behaviour + texture + realism level. It must be specific to this subject.

Bad:  "cinematic, dark, moody, 8K, ultra detailed"
Good: "flat overcast grey, deep focus, 16mm grain, institutional realism"
Good: "high-contrast sodium night, shallow focus, clean digital, restrained"

Never include: 8K, ultra-detailed, masterpiece, award-winning, trending.

CONTINUITY ENTITIES:
Identify every person, location, organisation, or object that appears in
THREE OR MORE distinct moments in the script. For each, write a locked
visual descriptor that all later prompts will reference verbatim, so the
same person looks like the same person across the whole film.

EVIDENCE CLAIMS:
Identify the factual claims that carry the argument — statistics, dated
events, financial figures, quoted statements. These are the moments where
authentic evidence beats an AI-generated image. List them so a later stage
can verify each one received visual support.

RECURRING MOTIFS:
Create 2-5 visual motifs that reinforce the argument and can recur across
acts. A motif must be reproducible with still images, Ken Burns motion, or
motion graphics. Do not propose motifs requiring live-action video.

ACTS:
Divide the script into 3-5 acts by narrative function, not length.

Return ONLY valid JSON. No markdown fences, no preamble.

OUTPUT SCHEMA — return exactly this shape:
{
  "visual_thesis": "",
  "audience_experience": {
    "opening": "", "setup": "", "escalation": "",
    "reveal": "", "conclusion": ""
  },
  "style_bible": {
    "visual_signature": "",
    "colour_direction": "",
    "lighting_approach": "",
    "realism_level": "",
    "typography": "",
    "graphics_treatment": "",
    "map_style": "",
    "data_viz_style": "",
    "document_treatment": "",
    "archival_treatment": "",
    "transition_language": ""
  },
  "recurring_motifs": [
    { "id": "motif_1", "name": "", "description": "", "reinforces": "" }
  ],
  "continuity_entities": [
    {
      "id": "ent_jobs",
      "type": "person | location | organisation | object",
      "name": "",
      "locked_descriptor": "",
      "prohibited_variations": ""
    }
  ],
  "acts": [
    { "act_number": 1, "title": "", "purpose": "", "opening_line": "", "closing_line": "" }
  ],
  "pacing_strategy": {
    "fast_sections": [], "controlled_sections": [],
    "reflective_sections": [], "attention_resets": []
  },
  "sound_direction": {
    "music": "", "ambience": "", "silence_moments": "",
    "impact_moments": "", "transition_audio": ""
  },
  "evidence_claims": [
    { "id": "claim_1", "claim": "", "type": "statistic | date | financial | quote | event", "preferred_evidence": "" }
  ]
}`;

// Dedicated minimal parser — NOT extractJSON from services/claude.js. extractJSON is
// scene-array specific: every one of its return paths requires a non-empty ARRAY (or an
// object with a .scenes array), so it throws on a perfectly valid top-level treatment
// object. Same reasoning as parseMatchCutResponse in claude.js. extractJSON is exported
// from claude.js for callers that DO expect scene arrays.
function extractTreatmentJSON(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Empty response from Claude');
  }

  console.log('[director] response length:', text.length, 'chars');

  // Strip markdown fences first
  const clean = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // 1. Direct parse
  try {
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}

  // 2. Find object boundaries and parse (handles preamble/trailing prose)
  const objStart = clean.indexOf('{');
  const objEnd   = clean.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(clean.slice(objStart, objEnd + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }

  console.error('[director] could not parse response. First 500:', text.slice(0, 500));
  throw new Error(`Could not parse treatment response (length: ${text.length}). Last 100 chars: ${text.slice(-100)}`);
}

// Project metadata injected at the top of the user message — same pattern as
// attemptAnalysis in services/claude.js.
function buildTreatmentUserMessage(scriptText, metadata = {}) {
  const wordCount = scriptText.trim().split(/\s+/).filter(Boolean).length;
  return `VIDEO TITLE: ${metadata.title || 'Untitled'}
NICHE: ${metadata.niche || 'General'}
NARRATOR TONE: ${metadata.narratorTone || 'Authoritative'}
TARGET DURATION: ${metadata.targetDuration || 'full'}

SCRIPT (${wordCount} words):
${scriptText}`;
}

async function callTreatmentModel(userMessage) {
  const client = new Anthropic();
  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 8192,
    system:     TREATMENT_SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userMessage }],
  });
  console.log('[director] stop_reason:', message.stop_reason);
  return message.content[0]?.text || '';
}

// claudeCaller is injectable (defaults to the real call above) so tests can supply a fake
// without real API credentials — same pattern as detectMatchCutCandidates in claude.js.
// Retry-once-on-parse-failure mirrors analyzeScript: first failure logs and retries with a
// corrective reminder appended; a second failure propagates to the route (→ 500 with detail).
async function generateTreatment(scriptText, metadata = {}, claudeCaller = callTreatmentModel) {
  const userMessage = buildTreatmentUserMessage(scriptText, metadata);
  try {
    return extractTreatmentJSON(await claudeCaller(userMessage));
  } catch (err) {
    console.warn('[director] treatment attempt failed:', err.message);
    console.warn('[director] retrying once...');
    const retryMessage = `${userMessage}

REMINDER: Return ONLY the raw JSON object from the OUTPUT SCHEMA — starting with { and ending with }. No markdown fences, no preamble, no explanation.`;
    return extractTreatmentJSON(await claudeCaller(retryMessage));
  }
}

// ─── DD-3: per-section treatment regeneration ───────────────────────────────
// One scoped Claude call that regenerates a single treatment section while seeing the
// script AND the current full treatment, so the new section stays coherent with the rest.

const TREATMENT_SECTIONS = [
  'visual_thesis', 'audience_experience', 'style_bible', 'recurring_motifs',
  'continuity_entities', 'acts', 'pacing_strategy', 'sound_direction',
];

async function callSectionModel(userMessage) {
  const client = new Anthropic();
  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 8192,
    system:     TREATMENT_SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userMessage }],
  });
  console.log('[director] section regen stop_reason:', message.stop_reason);
  return message.content[0]?.text || '';
}

function buildSectionUserMessage(scriptText, metadata, treatment, section) {
  return `${buildTreatmentUserMessage(scriptText, metadata)}

CURRENT APPROVED TREATMENT (context — do not change anything outside the requested section):
${JSON.stringify(treatment, null, 2)}

TASK: Regenerate ONLY the "${section}" section of this treatment. Produce a fresh take on
that section while staying coherent with every other section above (same film, same
argument, same continuity). Follow the OUTPUT SCHEMA's shape for that section exactly.

Return ONLY a JSON object with exactly one key, "${section}", whose value is the
regenerated section. No markdown fences, no preamble.`;
}

// Retry-once mirrors generateTreatment. Throws after the second failure — the route
// translates that into a 500 with detail.
async function regenerateTreatmentSection(scriptText, metadata = {}, treatment, section, claudeCaller = callSectionModel) {
  if (!TREATMENT_SECTIONS.includes(section)) {
    throw new Error(`Unknown treatment section: ${section}`);
  }
  const userMessage = buildSectionUserMessage(scriptText, metadata, treatment, section);

  const extractSection = (raw) => {
    const parsed = extractTreatmentJSON(raw);
    // Expected: { [section]: value }. Tolerate a full-treatment response by picking the key.
    if (parsed[section] === undefined) {
      throw new Error(`Section response missing "${section}" key`);
    }
    return parsed[section];
  };

  try {
    return extractSection(await claudeCaller(userMessage));
  } catch (err) {
    console.warn(`[director] section "${section}" regeneration failed:`, err.message);
    console.warn('[director] retrying once...');
    return extractSection(await claudeCaller(
      `${userMessage}\n\nREMINDER: Return ONLY {"${section}": ...} — a JSON object with that single key.`));
  }
}

module.exports = {
  generateTreatment,
  regenerateTreatmentSection,
  TREATMENT_SECTIONS,
  extractTreatmentJSON,
  buildTreatmentUserMessage,
};
