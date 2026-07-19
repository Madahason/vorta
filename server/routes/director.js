// DD-1: Documentary Director routes — mounted at /api/director.
//
// POST  /api/director/treatment    — generate + persist a treatment for a project
// GET   /api/director/:projectId   — read stored direction ({ direction: null } if none; 200)
// PATCH /api/director/:projectId   — deep-merge a partial treatment (DD-2 inline edits)

const express = require('express');
const router  = express.Router();

const {
  generateTreatment, regenerateTreatmentSection, TREATMENT_SECTIONS,
  regenerateSceneField, SCENE_FIELDS,
} = require('../services/director');
const { readDirection, writeDirection } = require('../services/directionStore');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Objects merge recursively; arrays and scalars replace wholesale.
function deepMerge(target, patch) {
  const out = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = (isPlainObject(value) && isPlainObject(out[key]))
      ? deepMerge(out[key], value)
      : value;
  }
  return out;
}

// POST /api/director/treatment — body { projectId, scriptText, metadata }
router.post('/treatment', async (req, res) => {
  const { projectId, scriptText, metadata } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }
  if (typeof scriptText !== 'string' || scriptText.trim().length === 0) {
    return res.status(400).json({ error: 'scriptText must be a non-empty string' });
  }

  try {
    const treatment = await generateTreatment(scriptText, metadata || {});
    writeDirection(projectId, { treatment });
    res.json({ treatment });
  } catch (err) {
    console.error('[director] treatment generation failed:', err.message);
    res.status(500).json({ error: 'Treatment generation failed', detail: err.message });
  }
});

// POST /api/director/scene/regenerate — DD-4 per-field scene regeneration.
// Registered BEFORE /:projectId/regenerate: that param route would otherwise treat the
// literal segment "scene" as :projectId and swallow this request.
// Body { projectId, scene, field, direction, neighbors }.
router.post('/scene/regenerate', async (req, res) => {
  const { scene, field, direction, neighbors } = req.body || {};

  if (!SCENE_FIELDS.includes(field)) {
    return res.status(400).json({ error: `field must be one of: ${SCENE_FIELDS.join(', ')}` });
  }
  if (!scene || typeof scene !== 'object') {
    return res.status(400).json({ error: 'scene object is required' });
  }
  if (scene.locked === true) {
    return res.status(409).json({ error: 'Scene is locked — unlock it before regenerating this field.' });
  }

  try {
    const patch = await regenerateSceneField(scene, field, direction, neighbors || {});
    res.json({ patch });
  } catch (err) {
    console.error(`[director] scene field regeneration failed (${field}):`, err.message);
    res.status(500).json({ error: 'Scene field regeneration failed', detail: err.message });
  }
});

// POST /api/director/:projectId/regenerate — DD-3 per-section regeneration.
// Body { section, scriptText, metadata }. One scoped Claude call, merged into the stored
// treatment via the same deep-merge semantics as PATCH.
router.post('/:projectId/regenerate', async (req, res) => {
  const { section, scriptText, metadata } = req.body || {};

  if (!TREATMENT_SECTIONS.includes(section)) {
    return res.status(400).json({ error: `section must be one of: ${TREATMENT_SECTIONS.join(', ')}` });
  }
  if (typeof scriptText !== 'string' || scriptText.trim().length === 0) {
    return res.status(400).json({ error: 'scriptText must be a non-empty string' });
  }
  const existing = readDirection(req.params.projectId);
  if (!existing?.treatment) {
    return res.status(404).json({ error: 'No direction exists for this project — generate a treatment first' });
  }

  try {
    const value = await regenerateTreatmentSection(scriptText, metadata || {}, existing.treatment, section);
    const merged = deepMerge(existing.treatment, { [section]: value });
    const stored = writeDirection(req.params.projectId, { treatment: merged, audit: existing.audit ?? null });
    res.json({ treatment: stored.treatment, updatedAt: stored.updatedAt, section });
  } catch (err) {
    console.error(`[director] section regeneration failed (${section}):`, err.message);
    res.status(500).json({ error: 'Section regeneration failed', detail: err.message });
  }
});

// GET /api/director/:projectId — absence is a valid state, not a 404
router.get('/:projectId', (req, res) => {
  const direction = readDirection(req.params.projectId);
  res.json({ direction });
});

// PATCH /api/director/:projectId — body is a partial treatment object, OR
// { audit: {...} } to write a DD-5 director-review report into the audit slot DD-1
// reserved. audit is a wholesale replace (a fresh report each run, not something that
// makes sense to deep-merge) and is independent of any treatment fields in the same body —
// an audit-only PATCH (just { audit }) leaves treatment completely untouched.
router.patch('/:projectId', (req, res) => {
  const existing = readDirection(req.params.projectId);
  const body = req.body;
  if (!isPlainObject(body)) {
    return res.status(400).json({ error: 'PATCH body must be a partial treatment object' });
  }
  const { audit, ...treatmentPatch } = body;
  const hasTreatmentPatch = Object.keys(treatmentPatch).length > 0;

  // Editing treatment fields still requires an existing treatment to merge into. An
  // audit-only PATCH doesn't — DD-5's Director Review runs (and must persist) for
  // projects that skipped Direction entirely, which never had a direction.json to begin
  // with, so this creates a fresh minimal record for them instead of 404ing.
  if (!existing && hasTreatmentPatch) {
    return res.status(404).json({ error: 'No direction exists for this project — generate a treatment first' });
  }

  const merged = deepMerge(existing?.treatment || {}, treatmentPatch);
  const nextAudit = audit !== undefined ? audit : (existing?.audit ?? null);
  const stored = writeDirection(req.params.projectId, { treatment: merged, audit: nextAudit });
  res.json({ treatment: stored.treatment, audit: stored.audit, updatedAt: stored.updatedAt });
});

module.exports = router;
