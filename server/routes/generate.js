const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { generateImage } = require('../services/higgsfield');

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

function downloadImage(url, dest, hops = 0) {
  if (hops > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(downloadImage(res.headers.location, dest, hops + 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Image download failed: HTTP ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlink(dest, () => {}); reject(err); });
    }).on('error', reject);
  });
}

async function processScene(projectId, scene, assetsDir) {
  const entry = store.get(projectId);
  try {
    entry.progress[scene.scene_id].status = 'generating';
    broadcast(projectId, { type: 'update', scene_id: scene.scene_id, status: 'generating' });

    const outputUrl = await generateImage(scene.higgsfield_prompt);

    const dest = path.join(assetsDir, `${scene.scene_id}.jpg`);
    await downloadImage(outputUrl, dest);

    const image_path = `/projects/${projectId}/assets/${scene.scene_id}.jpg`;
    entry.progress[scene.scene_id].status = 'done';
    entry.progress[scene.scene_id].image_path = image_path;
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
  const { scenes, projectId: reqProjectId } = req.body;

  if (!Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: 'scenes array is required' });
  }

  const imageScenes = scenes.filter(s => s.shot_type === 'image');
  if (!imageScenes.length) {
    return res.status(400).json({ error: 'No image scenes to generate' });
  }

  const projectId = reqProjectId || `proj_${Date.now()}`;
  const assetsDir = path.join(__dirname, '../../projects', projectId, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  // Save scenes.json for the project
  const scenesPath = path.join(__dirname, '../../projects', projectId, 'scenes.json');
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2));

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
  const { projectId, scene_id, higgsfield_prompt } = req.body;

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
    await processScene(projectId, { scene_id, higgsfield_prompt }, assetsDir);
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

module.exports = router;
