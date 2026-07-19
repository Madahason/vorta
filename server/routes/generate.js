const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { generateImage } = require('../services/visualProvider');
const { enhancePrompt, enhanceAllPrompts } = require('../services/promptEnhancer');
const { downloadImage } = require('../services/imageDownload');

// In-memory progress store: projectId → { progress, clients, allDone }
const store = new Map();

// ─── helpers ───────────────────────────────────────────────────────────────

function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(projectId, data) {
  const entry = store.get(projectId);
  if (!entry) return;
  entry.clients.forEach(client => sendEvent(client, data));
}

async function processScene(projectId, scene, assetsDir) {
  const entry = store.get(projectId);
  try {
    entry.progress[scene.scene_id].status = 'generating';
    broadcast(projectId, { type: 'update', scene_id: scene.scene_id, status: 'generating' });

    const promptToUse = await enhancePrompt(scene, false);
    const outputUrl = await generateImage(promptToUse);

    // Use the real extension from the URL (Higgsfield returns .png)
    const ext = path.extname(new URL(outputUrl).pathname) || '.png';
    const filename = `${scene.scene_id}${ext}`;
    const dest = path.join(assetsDir, filename);
    await downloadImage(outputUrl, dest);

    const image_path = `/projects/${projectId}/assets/${filename}`;
    entry.progress[scene.scene_id].status = 'done';
    entry.progress[scene.scene_id].image_path = image_path;
    console.log(`[generate] scene ${scene.scene_id} done → ${image_path}`);
    broadcast(projectId, { type: 'update', scene_id: scene.scene_id, status: 'done', image_path });
  } catch (err) {
    console.error(`[generate] scene ${scene.scene_id} failed:`, err.message);
    entry.progress[scene.scene_id].status = 'failed';
    entry.progress[scene.scene_id].error = err.message;
    broadcast(projectId, { type: 'update', scene_id: scene.scene_id, status: 'failed', error: err.message });
  }
}

// ─── POST /api/generate — start generation ─────────────────────────────────

router.post('/', async (req, res) => {
  const { scenes, projectId: reqProjectId, beats, analysis, edl, validation_report } = req.body;

  if (!Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: 'scenes array is required' });
  }

  const imageScenes = scenes.filter(s => s.shot_type === 'image');
  if (!imageScenes.length) {
    return res.status(400).json({ error: 'No image scenes to generate' });
  }

  const projectId = reqProjectId || `proj_${Date.now()}`;
  const projectDir = path.join(__dirname, '../../projects', projectId);
  const assetsDir = path.join(projectDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  // Save scenes.json for the project
  const scenesPath = path.join(projectDir, 'scenes.json');
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2));

  // Retention-engine stage outputs (beats/analysis/edl/validation_report) — only present
  // when VISUAL_ENGINE=retention produced this project. Persisted for the future
  // retention-graph feedback loop (see PLAN.md). Additive only — percentage-engine
  // projects simply don't have these files.
  const stageOutputs = { 'beats.json': beats, 'analysis.json': analysis, 'edl.json': edl, 'validation_report.json': validation_report };
  for (const [filename, data] of Object.entries(stageOutputs)) {
    if (data === undefined) continue;
    fs.writeFileSync(path.join(projectDir, filename), JSON.stringify(data, null, 2));
  }

  // Initialise progress for every scene
  const progress = {};
  scenes.forEach(s => {
    progress[s.scene_id] = {
      scene_id: s.scene_id,
      shot_type: s.shot_type,
      status: s.shot_type === 'image' ? 'pending' : 'skipped',
      image_path: null,
      error: null,
    };
  });

  store.set(projectId, { progress, clients: [], allDone: false });
  res.json({ projectId, total: imageScenes.length });

  // Process image scenes sequentially in background
  ;(async () => {
    for (const scene of imageScenes) {
      await processScene(projectId, scene, assetsDir);
    }
    const entry = store.get(projectId);
    if (entry) {
      entry.allDone = true;
      broadcast(projectId, { type: 'done' });
    }
  })();
});

// ─── GET /api/generate/progress/:projectId — SSE stream ────────────────────

router.get('/progress/:projectId', (req, res) => {
  const { projectId } = req.params;
  const entry = store.get(projectId);

  if (!entry) {
    return res.status(404).json({ error: 'Project not found — server may have restarted' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Replay current state to the new client
  Object.values(entry.progress).forEach(p => {
    if (p.status !== 'pending') {
      sendEvent(res, { type: 'update', ...p });
    }
  });

  if (entry.allDone) {
    sendEvent(res, { type: 'done' });
    return res.end();
  }

  entry.clients.push(res);

  req.on('close', () => {
    entry.clients = entry.clients.filter(c => c !== res);
  });
});

// ─── POST /api/generate/retry — retry a single failed scene ────────────────

router.post('/retry', async (req, res) => {
  // style_lock is optional (DD-3): retried scenes from direction projects pass their
  // treatment signature through so promptEnhancer never re-appends the default constant.
  const { projectId, scene_id, higgsfield_prompt, style_lock } = req.body;

  if (!projectId || !scene_id || !higgsfield_prompt) {
    return res.status(400).json({ error: 'projectId, scene_id, and higgsfield_prompt are required' });
  }

  let entry = store.get(projectId);
  const assetsDir = path.join(__dirname, '../../projects', projectId, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  if (!entry) {
    // Server restarted — recreate a minimal store entry
    entry = { progress: {}, clients: [], allDone: false };
    store.set(projectId, entry);
  }

  entry.progress[scene_id] = { scene_id, shot_type: 'image', status: 'pending', image_path: null, error: null };
  entry.allDone = false;

  res.json({ ok: true });

  ;(async () => {
    await processScene(projectId, { scene_id, higgsfield_prompt, ...(style_lock ? { style_lock } : {}) }, assetsDir);
    // Mark done only if all image scenes in this project are resolved
    const allResolved = Object.values(entry.progress)
      .filter(p => p.shot_type === 'image')
      .every(p => p.status === 'done' || p.status === 'failed');
    if (allResolved) {
      entry.allDone = true;
      broadcast(projectId, { type: 'done' });
    }
  })();
});

// ─── POST /api/generate/enhance-prompts — batch enhance all scene prompts ──────

router.post('/enhance-prompts', async (req, res) => {
  const { scenes } = req.body;
  if (!Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: 'scenes array is required' });
  }
  try {
    const enhanced = await enhanceAllPrompts(scenes);
    res.json({ scenes: enhanced });
  } catch (err) {
    console.error('[generate] enhance-prompts failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
