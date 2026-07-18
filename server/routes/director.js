// DD-1: Documentary Director routes — mounted at /api/director.
//
// POST  /api/director/treatment    — generate + persist a treatment for a project
// GET   /api/director/:projectId   — read stored direction ({ direction: null } if none; 200)
// PATCH /api/director/:projectId   — deep-merge a partial treatment (DD-2 inline edits)

const express = require('express');
const router  = express.Router();

const { generateTreatment } = require('../services/director');
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

// GET /api/director/:projectId — absence is a valid state, not a 404
router.get('/:projectId', (req, res) => {
  const direction = readDirection(req.params.projectId);
  res.json({ direction });
});

// PATCH /api/director/:projectId — body is a partial treatment object
router.patch('/:projectId', (req, res) => {
  const existing = readDirection(req.params.projectId);
  if (!existing) {
    return res.status(404).json({ error: 'No direction exists for this project — generate a treatment first' });
  }
  const patch = req.body;
  if (!isPlainObject(patch)) {
    return res.status(400).json({ error: 'PATCH body must be a partial treatment object' });
  }

  const merged = deepMerge(existing.treatment || {}, patch);
  const stored = writeDirection(req.params.projectId, { treatment: merged, audit: existing.audit ?? null });
  res.json({ treatment: stored.treatment, updatedAt: stored.updatedAt });
});

module.exports = router;
