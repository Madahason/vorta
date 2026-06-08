const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');

// In-memory render job store — keyed by projectId
const renderJobs = new Map();

// ── helpers ────────────────────────────────────────────────────────────────────

const q = (p) => `"${p}"`;  // quote a path for shell command

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(job, data) {
  job.sseClients.forEach(clientRes => {
    try { sendSSE(clientRes, data); } catch {}
  });
}

// Parse Remotion progress lines — handles "X/Y" frame counts and "N%" patterns
function parseProgress(line, job) {
  // Strip ANSI escape codes
  const clean = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\r\n]/g, '');
  if (!clean.trim()) return false;

  let updated = false;

  const frameMatch = clean.match(/(\d+)\s*\/\s*(\d+)/);
  if (frameMatch) {
    const frame      = parseInt(frameMatch[1]);
    const total      = parseInt(frameMatch[2]);
    if (total > 0 && frame <= total) {
      job.progress.frame       = frame;
      job.progress.totalFrames = total;
      job.progress.percent     = Math.min(99, Math.round((frame / total) * 100));
      updated = true;
    }
  }

  if (!updated) {
    const pctMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]);
      if (pct >= 0 && pct <= 100) {
        job.progress.percent = Math.round(pct);
        updated = true;
      }
    }
  }

  return updated;
}

// ── POST / — start render ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { projectId, scenes, selectedClips, audio } = req.body;

  if (!projectId || !Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: 'projectId and scenes array are required' });
  }

  // Kill any previous render for this project
  const existing = renderJobs.get(projectId);
  if (existing?.process) {
    try { existing.process.kill(); } catch {}
  }

  const SERVER_PORT = process.env.PORT || 3001;

  // Transform image_path from /projects/... URL to full HTTP URL so Remotion's
  // headless Chrome can load images from the running Express server
  const absoluteScenes = scenes.map(scene => ({
    ...scene,
    image_path: scene.image_path
      ? `http://localhost:${SERVER_PORT}${scene.image_path.startsWith('/') ? '' : '/'}${scene.image_path}`
      : null,
  }));

  // Build imagePaths map expected by Documentary composition
  const imagePaths = {};
  absoluteScenes.forEach(s => {
    if (s.image_path) imagePaths[s.scene_id] = s.image_path;
  });

  // Transform audio path to HTTP URL if provided
  const audioProps = audio?.path
    ? {
        ...audio,
        path: `http://localhost:${SERVER_PORT}${audio.path.startsWith('/') ? '' : '/'}${audio.path}`,
      }
    : null;

  // Build audio specs for background music / ambient / stings
  let audioSpecs = []
  try {
    const { buildProjectAudioSpecsCached } = require('../services/audioMixer')
    audioSpecs = buildProjectAudioSpecsCached(absoluteScenes)
    // Rewrite local file paths to HTTP URLs so Remotion headless Chrome can fetch them
    audioSpecs = audioSpecs.map(spec => ({
      ...spec,
      music: spec.music ? {
        ...spec.music,
        url: spec.music.url
          ? `http://localhost:${SERVER_PORT}${spec.music.url}`
          : null,
      } : null,
      ambient: spec.ambient ? {
        ...spec.ambient,
        url: spec.ambient.url
          ? `http://localhost:${SERVER_PORT}${spec.ambient.url}`
          : null,
      } : null,
      sting: spec.sting ? {
        ...spec.sting,
        url: spec.sting.url
          ? `http://localhost:${SERVER_PORT}${spec.sting.url}`
          : null,
      } : null,
    }))
  } catch (err) {
    console.warn('[render] audioSpecs build failed (non-fatal):', err.message)
  }

  const propsData = {
    scenes:        absoluteScenes,
    imagePaths,
    selectedClips: selectedClips || {},
    audio:         audioProps,
    audioSpecs,
  };

  // Write project files
  const projectDir = path.resolve(__dirname, `../../projects/${projectId}`);
  const outputDir  = path.join(projectDir, 'output');
  const propsPath  = path.join(projectDir, 'scenes.json');
  const outputPath = path.join(outputDir, 'final.mp4');

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(propsPath, JSON.stringify(propsData, null, 2));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write project files', details: err.message });
  }

  const remotionDir  = path.resolve(__dirname, '../../remotion');

  // Load render settings from defaults.json
  let renderDefaults = {};
  try { renderDefaults = require('../config/defaults.json').render || {}; } catch {}
  const concurrency = Math.max(1, parseInt(renderDefaults.concurrency) || 1);
  const fps         = [24, 30, 60].includes(parseInt(renderDefaults.fps)) ? parseInt(renderDefaults.fps) : 30;

  const cmd = `npx remotion render src/index.jsx Documentary ${q(outputPath)} --props ${q(propsPath)} --overwrite --concurrency=${concurrency}`;

  console.log(`[render] Starting render for project ${projectId}`);
  console.log(`[render] ${cmd}`);

  const proc = spawn(cmd, [], {
    cwd:   remotionDir,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env:   { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  });

  const job = {
    process:  proc,
    progress: { percent: 0, frame: 0, totalFrames: 0 },
    status:   'rendering',
    outputPath,
    stderr:   '',
    sseClients: new Set(),
  };
  renderJobs.set(projectId, job);

  const handleChunk = (chunk) => {
    const text  = chunk.toString();
    const lines = text.split(/\r?\n/);
    lines.forEach(line => {
      if (parseProgress(line, job)) {
        broadcast(job, {
          type:        'progress',
          percent:     job.progress.percent,
          frame:       job.progress.frame,
          totalFrames: job.progress.totalFrames,
        });
      }
    });
  };

  proc.stdout.on('data', handleChunk);
  proc.stderr.on('data', (chunk) => {
    job.stderr += chunk.toString();
    handleChunk(chunk);
  });

  proc.on('close', (code) => {
    console.log(`[render] Exited with code ${code} for project ${projectId}`);
    if (code === 0) {
      job.status = 'done';
      let fileSize = 0;
      try { fileSize = fs.statSync(outputPath).size; } catch {}
      broadcast(job, {
        type:       'done',
        outputPath: `/projects/${projectId}/output/final.mp4`,
        fileSize,
      });
    } else {
      job.status = 'error';
      broadcast(job, {
        type:    'error',
        message: job.stderr || `Render process exited with code ${code}`,
      });
    }
    job.sseClients.forEach(c => { try { c.end(); } catch {} });
    job.sseClients.clear();
  });

  proc.on('error', (err) => {
    console.error(`[render] Spawn error for ${projectId}:`, err);
    job.status = 'error';
    broadcast(job, { type: 'error', message: err.message });
    job.sseClients.forEach(c => { try { c.end(); } catch {} });
    job.sseClients.clear();
  });

  res.json({ started: true, projectId });
});

// ── GET /progress/:projectId — SSE stream ─────────────────────────────────────
router.get('/progress/:projectId', (req, res) => {
  const { projectId } = req.params;
  const job = renderJobs.get(projectId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  if (!job) {
    sendSSE(res, { type: 'error', message: 'No active render job — server may have restarted' });
    res.end();
    return;
  }

  if (job.status === 'done') {
    sendSSE(res, { type: 'done', outputPath: `/projects/${projectId}/output/final.mp4` });
    res.end();
    return;
  }

  if (job.status === 'error') {
    sendSSE(res, { type: 'error', message: job.stderr || 'Render failed' });
    res.end();
    return;
  }

  // Send current snapshot immediately so the client doesn't wait for next event
  sendSSE(res, {
    type:        'progress',
    percent:     job.progress.percent,
    frame:       job.progress.frame,
    totalFrames: job.progress.totalFrames,
  });

  job.sseClients.add(res);
  req.on('close', () => job.sseClients.delete(res));
});

// ── DELETE /:projectId — cancel render ────────────────────────────────────────
router.delete('/:projectId', (req, res) => {
  const { projectId } = req.params;
  const job = renderJobs.get(projectId);

  if (job?.process) {
    try { job.process.kill(); } catch {}
    job.status = 'cancelled';
    job.sseClients.forEach(c => { try { c.end(); } catch {} });
    job.sseClients.clear();
    renderJobs.delete(projectId);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'No active render job found' });
  }
});

module.exports = router;
