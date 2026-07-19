const router = require('express').Router();
const { analyzeScript, analyzeScriptWithDirection } = require('../services/claude');
const { loadDefaults }  = require('./settings');
const { startSeed }     = require('../services/clipSeeder');
const { runRetentionEngine } = require('../engine');
const { readDirection, resolveStyleLock } = require('../services/directionStore');
const { enforceContinuity } = require('../services/continuityEnforcement');

// VISUAL_ENGINE=percentage|retention — default retention. The percentage allocator
// (analyzeScript, unchanged above) stays available behind this flag so existing projects
// and any rollback need keep working exactly as before. See PLAN.md "Migration & safety".
function useRetentionEngine() {
  return process.env.VISUAL_ENGINE !== 'percentage';
}

// The pre-DD-3 path, unchanged — runs for every project without a direction, and as the
// fallback when treatment-aware analysis fails after its retry.
async function runStandardAnalysis({ script, metadata, defaults }) {
  if (useRetentionEngine()) {
    const { scenes, engine, beats, analysis, edl, validation_report } =
      await runRetentionEngine({ script, metadata: metadata || {}, defaults });
    return { scenes, engine, beats, analysis, edl, validation_report };
  }
  const scenes = await analyzeScript({ script, metadata: metadata || {}, defaults });
  return { scenes, engine: 'percentage' };
}

router.post('/', async (req, res) => {
  // DD-3: projectId travels top-level (NOT inside metadata) so the background-seed
  // trigger below — which reads metadata.projectId — keeps its exact pre-DD-3 behaviour.
  const { script, metadata, projectId } = req.body;

  if (!script?.trim()) {
    return res.status(400).json({ error: 'script is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured — add it to .env' });
  }

  try {
    const defaults = loadDefaults();

    // DD-3 route selection. readDirection hits disk on every call (no in-memory cache),
    // so Direction-step edits take effect on the next analysis without a server restart.
    const direction = projectId ? readDirection(projectId) : null;

    let responseBody;
    if (direction?.treatment) {
      console.log(`[analyze] route: TREATMENT-AWARE (direction.json found for ${projectId})`);
      try {
        const styleLock = resolveStyleLock(direction);
        const rawScenes = await analyzeScriptWithDirection({
          script, metadata: metadata || {}, defaults, direction,
        });
        const { scenes, warnings } = enforceContinuity(rawScenes, direction, styleLock);
        // DD-1's resolveStyleLock finally in the pipeline: stamp every scene. On this
        // path prompts already end with the same resolved lock (postProcessScenes).
        scenes.forEach(s => { s.style_lock = styleLock; });
        responseBody = { scenes, engine: 'director', warnings };
      } catch (err) {
        // A degraded result beats a dead pipeline: fall back to the standard path.
        console.error('[analyze] treatment-aware analysis failed after retry:', err.message);
        console.warn('[analyze] route: FALLBACK → standard analysis (treatment ignored for this run)');
        responseBody = { ...(await runStandardAnalysis({ script, metadata, defaults })), warnings: [] };
      }
    } else {
      console.log(`[analyze] route: STANDARD (no direction${projectId ? ` for ${projectId}` : ' — no projectId sent'})`);
      responseBody = await runStandardAnalysis({ script, metadata, defaults });
    }

    res.json(responseBody);

    // Background seed — fire-and-forget after response is sent
    const { title, niche, projectId: seedProjectId } = metadata || {};
    if (title && seedProjectId) {
      startSeed({ title, niche: niche || 'General', projectId: seedProjectId, maxClips: 10 });
      console.log(`[analyze] background seed started for project ${seedProjectId}`);
    }
  } catch (err) {
    console.error('analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
