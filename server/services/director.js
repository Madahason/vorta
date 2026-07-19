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

// ─── DD-4: per-field scene regeneration ─────────────────────────────────────
// One scoped Claude call per requested field. Only the fields listed in FIELD_SPECS[field]
// are ever taken from the model's response — script_excerpt, scene_id, duration_seconds,
// audio_path, and locked are structurally impossible to change through this endpoint
// regardless of what the model returns, because nothing outside that allowlist is copied
// into the patch.

const { sceneTypeToShotType, SCENE_TYPES } = require('./claude');

const SCENE_FIELDS = [
  'visual_concept', 'image_prompt', 'purpose', 'asset_strategy',
  'alternative_concept', 'scene_type', 'all',
];

const FIELD_SPECS = {
  visual_concept: {
    keys: ['higgsfield_prompt', 'subject_anchors'],
    instruction: 'Rewrite the image prompt (a cinematographer\'s shot note: subject + '
      + 'composition + lighting + period detail + atmosphere) and the subject_anchors for '
      + 'this scene. subject_anchors is 3-6 SHORT specific named-entity strings (people, '
      + 'companies, products, events, places, years) — not full sentences or descriptions. '
      + 'Return {"higgsfield_prompt": "...", "subject_anchors": ["...", ...]}.',
  },
  image_prompt: {
    keys: ['higgsfield_prompt'],
    instruction: 'Rewrite ONLY the image prompt text for this scene, keeping the existing '
      + 'subject_anchors valid. Return {"higgsfield_prompt": "..."}.',
  },
  purpose: {
    keys: ['purpose'],
    instruction: 'Rewrite the four-part purpose object. Return {"purpose": {"narrative": '
      + '"", "informational": "", "emotional": "", "retention": ""}}. retention must be one '
      + 'of: curiosity, orientation, proof, escalation, contrast, surprise, '
      + 'emotional_connection, pattern_interrupt, explanation, payoff, breathing_room, transition.',
  },
  asset_strategy: {
    keys: ['asset_strategy', 'asset_search'],
    instruction: 'Rewrite the asset strategy. Return {"asset_strategy": {"method": "...", '
      + '"rationale": "..."}}. method must be one of: ai_image, motion_graphic, '
      + 'stock_footage, archival_footage, primary_document, photograph, screenshot, hybrid. '
      + 'If real material would be stronger than an AI image, also include "asset_search": '
      + '{ "query", "person", "organisation", "location", "date_range", "event", '
      + '"source_category", "quality_note" }; otherwise omit asset_search entirely.',
  },
  alternative_concept: {
    keys: ['alternative_concept'],
    instruction: 'Propose one practical alternative concept using a DIFFERENT production '
      + 'method than the scene\'s current asset_strategy.method — not a minor variation. '
      + 'Return {"alternative_concept": {"method": "...", "description": "..."}}.',
  },
  scene_type: {
    keys: ['scene_type'],
    instruction: `Reclassify this scene's scene_type by storytelling function. Choose exactly `
      + `one from: ${SCENE_TYPES.join(', ')}. Return {"scene_type": "..."}.`,
  },
  all: {
    keys: ['higgsfield_prompt', 'subject_anchors', 'purpose', 'asset_strategy', 'asset_search', 'alternative_concept', 'scene_type'],
    instruction: 'Refresh every regenerable field for this scene: the image prompt, subject '
      + 'anchors, purpose, asset strategy (and asset_search if applicable), alternative '
      + 'concept, and scene_type. Return a single JSON object containing all of these keys, '
      + 'each following the shapes described for the individual fields.',
  },
};

function buildSceneFieldSystemPrompt(field) {
  const spec = FIELD_SPECS[field];
  return `You are refining a single scene inside an approved documentary treatment. You are
not redesigning the film's look — that decision is already made. You are updating one
field on one scene, in place.

RULES (mandatory):
- Do NOT include the visual signature in any prompt text you write — it is appended
  automatically by the pipeline after your response. Repeating it wastes tokens.
- If continuity entities are listed below for this scene, reproduce their locked
  descriptor verbatim inside any image prompt you write. Never re-describe them in your
  own words.
- Do NOT change script_excerpt, scene_id, duration_seconds, or audio_path — you have no
  power over those fields. Ignore them even if you see them in the scene context below.
- Never invent an archive URL, a quotation, or a specific document you cannot verify
  exists. Describe what to look for, not what you claim exists.

TASK: ${spec.instruction}

Return ONLY the raw JSON object described above. No markdown fences, no preamble.`;
}

function buildSceneFieldUserMessage(scene, direction, neighbors) {
  const t  = direction?.treatment || {};
  const sb = t.style_bible || {};
  const entities = (t.continuity_entities || [])
    .filter(e => (scene.continuity_refs || []).includes(e.id))
    .map(e => `${e.id} | ${e.name} | ${e.locked_descriptor}`)
    .join('\n');

  return `VISUAL SIGNATURE (context only — do not repeat it in any prompt): ${sb.visual_signature || ''}

CONTINUITY ENTITIES FEATURED IN THIS SCENE:
${entities || '(none)'}

PREVIOUS SCENE: ${neighbors?.prev || '(none — this is the first scene)'}
THIS SCENE'S NARRATION: ${scene.script_excerpt || ''}
NEXT SCENE: ${neighbors?.next || '(none — this is the last scene)'}

CURRENT SCENE STATE (context for fields you are not asked to change):
${JSON.stringify({
    shot_type: scene.shot_type, scene_type: scene.scene_type, mood: scene.mood,
    higgsfield_prompt: scene.higgsfield_prompt, subject_anchors: scene.subject_anchors,
    purpose: scene.purpose, asset_strategy: scene.asset_strategy, asset_search: scene.asset_search,
    alternative_concept: scene.alternative_concept, continuity_refs: scene.continuity_refs,
  }, null, 2)}`;
}

async function callSceneFieldModel(userMessage, systemPrompt) {
  const client = new Anthropic();
  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2048,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userMessage }],
  });
  console.log('[director] scene field regen stop_reason:', message.stop_reason);
  return message.content[0]?.text || '';
}

// Retry-once mirrors the other DD-3/DD-4 Claude calls. Returns a PATCH object containing
// only the allowlisted keys for the requested field — never script_excerpt/scene_id/
// duration_seconds/audio_path/locked, regardless of what the model returns.
async function regenerateSceneField(scene, field, direction, neighbors = {}, claudeCaller = callSceneFieldModel) {
  const spec = FIELD_SPECS[field];
  if (!spec) throw new Error(`Unknown field: ${field}`);

  const systemPrompt = buildSceneFieldSystemPrompt(field);
  const userMessage   = buildSceneFieldUserMessage(scene, direction, neighbors);

  const runOnce = async (extra = '') => {
    const raw    = await claudeCaller(userMessage + extra, systemPrompt);
    const parsed = extractTreatmentJSON(raw);
    const patch  = {};
    spec.keys.forEach(k => { if (parsed[k] !== undefined) patch[k] = parsed[k]; });
    if (!Object.keys(patch).length) throw new Error('Response did not include any expected keys');
    return patch;
  };

  let patch;
  try {
    patch = await runOnce();
  } catch (err) {
    console.warn(`[director] scene field "${field}" regeneration failed:`, err.message);
    console.warn('[director] retrying once...');
    patch = await runOnce(`\n\nREMINDER: Return ONLY a JSON object with keys: ${spec.keys.join(', ')}.`);
  }

  // scene_type re-derives shot_type server-side (single source of truth) — dropped
  // entirely if the model returned something outside the allowed list.
  if (patch.scene_type) {
    if (!SCENE_TYPES.includes(patch.scene_type)) {
      delete patch.scene_type;
    } else {
      const shot_type = sceneTypeToShotType(patch.scene_type);
      if (shot_type) {
        patch.shot_type = shot_type;
        patch.real_footage_flag = shot_type === 'real_footage';
      }
    }
  }

  return patch;
}

module.exports = {
  generateTreatment,
  regenerateTreatmentSection,
  regenerateSceneField,
  SCENE_FIELDS,
  TREATMENT_SECTIONS,
  extractTreatmentJSON,
  buildTreatmentUserMessage,
};
