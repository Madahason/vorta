// DD-1: Documentary Director scene-schema extension (additive, unused for now).
//
// The canonical scene object is produced by postProcessScenes() in services/claude.js and
// is intentionally NOT modified in DD-1 — /api/analyze output must stay byte-for-byte
// identical. The Direction layer (DD-2..DD-5) attaches the OPTIONAL fields below to scenes
// it plans. Nothing reads them in DD-1; every field is optional with a safe default, so
// pre-DD-1 scenes loaded from localStorage or scenes.json remain valid without them.
//
// There was no existing scene normaliser/sanitiser to extend (client pages read
// localStorage raw; server fine-tune endpoints go through services/scenesFile.js, which is
// shape-agnostic), so this module is the single place that documents the extension and
// provides the defaults filler for later phases to wire in.

// Fresh object per call — purpose/asset_strategy/arrays must never be shared references
// across scenes.
function directorSceneDefaults() {
  return {
    act:                 null,   // act_number from treatment.acts this scene belongs to (DD-2)
    scene_type:          null,   // director-assigned scene classification (DD-2)
    purpose:             { narrative: '', informational: '', emotional: '', retention: '' },
    asset_strategy:      { method: null, rationale: '' }, // how the visual gets made (DD-3)
    asset_search:        null,   // search terms when asset_strategy.method needs sourcing
    continuity_refs:     [],     // ids from treatment.continuity_entities used in this scene
    alternative_concept: null,   // fallback visual concept if the primary can't be produced
    complexity:          null,   // production complexity estimate
    risk_flags:          [],     // e.g. likeness risk, evidence claim without support
    locked:              false,  // user locked this scene against regeneration
  };
}

// Fills the DD-1 defaults onto any scene missing them. Never overwrites an existing value,
// never removes or changes any existing field.
function applyDirectorSceneDefaults(scene) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return scene;
  const defaults = directorSceneDefaults();
  const out = { ...scene };
  for (const key of Object.keys(defaults)) {
    if (out[key] === undefined) out[key] = defaults[key];
  }
  return out;
}

function applyDirectorSceneDefaultsToAll(scenes) {
  return Array.isArray(scenes) ? scenes.map(applyDirectorSceneDefaults) : scenes;
}

module.exports = {
  directorSceneDefaults,
  applyDirectorSceneDefaults,
  applyDirectorSceneDefaultsToAll,
};
