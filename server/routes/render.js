const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');

// In-memory render job store — keyed by projectId
const renderJobs = new Map();

// ── path helpers ───────────────────────────────────────────────────────────────

const PROJECT_ROOT  = path.resolve(__dirname, '../..');
const SERVER_PORT   = process.env.PORT || 3001;

// Convert a relative URL like /projects/id/audio/scene_001.mp3 to a full HTTP
// URL pointing at the Express server.
//
// WHY HTTP instead of file:// or absolute path:
// Remotion CLI spawns headless Chrome which resolves relative URLs like
// /projects/... against its own bundle server (port 3000), not Express (port
// 3001) → 404.  Absolute filesystem paths get converted to file:///... which
// Remotion refuses ("Can only download URLs starting with http:// or https://").
// Full HTTP URLs with port 3001 are the only form that reliably works.
function toHttpUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;  // already absolute HTTP — return as-is
  const clean = url.startsWith('/') ? url : `/${url}`;
  return `http://localhost:${SERVER_PORT}${clean}`;
}

// Copy selected clip files from library/clips/ into remotion/public/clips/ so
// Remotion's bundle server can serve them via staticFile() during CLI rendering.
function syncClipsToRemotionPublic(selectedClips) {
  if (!selectedClips || Object.keys(selectedClips).length === 0) return;

  const remotionClipsDir = path.resolve(__dirname, '../../remotion/public/clips');
  if (!fs.existsSync(remotionClipsDir)) {
    fs.mkdirSync(remotionClipsDir, { recursive: true });
  }

  for (const [, clip] of Object.entries(selectedClips)) {
    if (!clip?.file) continue;
    const srcPath  = path.resolve(__dirname, '../..', clip.file.replace(/^\/+/, ''));
    const filename = path.basename(srcPath);
    const destPath = path.join(remotionClipsDir, filename);

    if (!fs.existsSync(srcPath)) {
      console.warn(`[render] clip file not found: ${srcPath}`);
      continue;
    }
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`[render] synced clip: ${filename}`);
    } else {
      console.log(`[render] clip already synced: ${filename}`);
    }
  }
}

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
  const clean = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\r\n]/g, '');
  if (!clean.trim()) return false;

  let updated = false;

  const frameMatch = clean.match(/(\d+)\s*\/\s*(\d+)/);
  if (frameMatch) {
    const frame = parseInt(frameMatch[1]);
    const total = parseInt(frameMatch[2]);
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

  console.log('[render] selectedClips count:', Object.keys(selectedClips || {}).length);

  // Sync selected clip files to remotion/public/clips/ before rendering
  syncClipsToRemotionPublic(selectedClips);

  // ── Build render props with full HTTP URLs ────────────────────────────────
  // All asset URLs in props must be full http://localhost:PORT/... URLs.
  // Remotion CLI's headless Chrome resolves relative URLs (/projects/...) against
  // its own bundle server (port 3000), not the Express server (port 3001).

  // Scenes: convert both image_path and audio_path to full HTTP URLs
  const renderScenes = scenes.map(scene => ({
    ...scene,
    image_path: toHttpUrl(scene.image_path),
    audio_path: toHttpUrl(scene.audio_path),
  }));

  // imagePaths map for Documentary composition (keyed by scene_id)
  const imagePaths = {};
  renderScenes.forEach(s => {
    if (s.image_path) imagePaths[s.scene_id] = s.image_path;
  });

  // Clips: convert file URLs to full HTTP URLs
  const renderClips = Object.fromEntries(
    Object.entries(selectedClips || {}).map(([sceneId, clip]) => [
      sceneId,
      clip?.file ? { ...clip, file: toHttpUrl(clip.file) } : clip,
    ])
  );

  // Uploaded narration audio (ExportPanel upload flow): convert to HTTP URL
  const audioProps = audio?.path ? { ...audio, path: toHttpUrl(audio.path) } : null;

  // Narration-only audio specs — music and sound effects are handled in post-production
  const audioSpecs = renderScenes.map(scene => ({
    scene_id:  scene.scene_id,
    narration: scene.audio_path ? { url: scene.audio_path, volume: 1.0 } : null,
  }));
  const narrationCount = audioSpecs.filter(s => s.narration?.url).length;
  console.log('[render] audioSpecs: narration', narrationCount, '/', audioSpecs.length, 'scenes');
  audioSpecs.forEach(s =>
    console.log(`  [render] scene ${s.scene_id}:`, s.narration?.url || 'NO NARRATION')
  );
  if (renderScenes[0]) console.log('[render] scene 0 image path:', renderScenes[0].image_path);

  const propsData = {
    scenes:        renderScenes,
    imagePaths,
    selectedClips: renderClips,
    audio:         audioProps,
    audioSpecs,
  };

  // Write project files
  const projectDir = path.resolve(PROJECT_ROOT, `projects/${projectId}`);
  const outputDir  = path.join(projectDir, 'output');
  const propsPath  = path.join(projectDir, 'scenes.json');
  const outputPath = path.join(outputDir, 'final.mp4');

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(propsPath, JSON.stringify(propsData, null, 2));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write project files', details: err.message });
  }

  const remotionDir = path.resolve(PROJECT_ROOT, 'remotion');

  // Load render settings from defaults.json
  let renderDefaults = {};
  try { renderDefaults = require('../config/defaults.json').render || {}; } catch {}
  const concurrency = Math.max(1, parseInt(renderDefaults.concurrency) || 1);

  // On Linux (Docker/Railway) Remotion needs the system Chromium path explicitly.
  // PUPPETEER_EXECUTABLE_PATH is set in the Dockerfile and Railway env vars.
  const chromeExecutable = process.platform === 'linux'
    ? (process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium')
    : undefined;
  const chromeFlag = chromeExecutable ? `--browser-executable ${q(chromeExecutable)}` : '';

  const cmd = `npx remotion render src/index.jsx Documentary ${q(outputPath)} --props ${q(propsPath)} --overwrite --concurrency=${concurrency} ${chromeFlag}`.trimEnd();

  console.log(`[render] Starting render for project ${projectId}`);
  console.log(`[render] ${cmd}`);

  const proc = spawn(cmd, [], {
    cwd:   remotionDir,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env:   { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  });

  const job = {
    process:    proc,
    progress:   { percent: 0, frame: 0, totalFrames: 0 },
    status:     'rendering',
    outputPath,
    stderr:     '',
    sseClients: new Set(),
  };
  renderJobs.set(projectId, job);

  const handleChunk = (chunk) => {
    const lines = chunk.toString().split(/\r?\n/);
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
