// Single home for style-lock strings (DD-1).
//
// STYLE_LOCK is the production string appended to every image/real_footage prompt by
// postProcessScenes() in services/claude.js and by services/promptEnhancer.js — moved here
// verbatim so there is exactly one copy. Its value must not change casually: /api/analyze
// output depends on it byte-for-byte.
//
// DEFAULT_STYLE_LOCK is the fallback returned by resolveStyleLock() in
// services/directionStore.js when a project has no direction.json, or its treatment has no
// usable style_bible.visual_signature. Not wired into scene generation until DD-3.
//
// NOTE: server/engine/config.js keeps its own deliberately diverged aesthetic string
// (clinical/investigative variant) — the retention EDL engine is intentionally decoupled
// and stays untouched.

const STYLE_LOCK =
  'photorealistic dark cinematic 4K shallow depth of field slow dolly movement documentary aesthetic muted tones, accurate real-world detail, no illustration no painting no cartoon style';

const DEFAULT_STYLE_LOCK =
  'dark cinematic grade, shallow depth of field, documentary';

module.exports = { STYLE_LOCK, DEFAULT_STYLE_LOCK };
