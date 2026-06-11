const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { exec } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Convert a relative URL like /projects/id/audio/scene_001.mp3 to an absolute
// filesystem path so Remotion CLI can access it.
function toAbsPath(url) {
  if (!url) return null;
  if (path.isAbsolute(url)) return url;
  if (/^[A-Z]:\\/i.test(url)) return url;
  return path.resolve(PROJECT_ROOT, url.replace(/^\//, '').replace(/\//g, path.sep));
}

router.post('/', async (req, res) => {
  const { projectId, scenes, selectedClips } = req.body;

  if (!projectId || !scenes?.length) {
    return res.status(400).json({ error: 'projectId and scenes required' });
  }

  const projectDir = path.resolve(PROJECT_ROOT, 'projects', projectId);
  const outputDir  = path.join(projectDir, 'output');
  const propsPath  = path.join(projectDir, 'scenes.json');
  const outputPath = path.join(outputDir, 'final.mp4');

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Convert all asset paths to absolute for Remotion CLI
  const absoluteScenes = scenes.map(s => ({
    ...s,
    image_path: toAbsPath(s.image_path),
    audio_path: toAbsPath(s.audio_path),
  }));

  // Simple audio specs — narration only, no music or ambient
  const audioSpecs = absoluteScenes.map(scene => ({
    scene_id:  scene.scene_id,
    narration: scene.audio_path ? { url: scene.audio_path, volume: 1.0 } : null,
    music:     null,
    ambient:   null,
    sting:     null,
    overlay_sounds: [],
  }));

  console.log('[render] projectId:', projectId);
  console.log('[render] scenes:', absoluteScenes.length);
  console.log('[render] with narration:', audioSpecs.filter(s => s.narration).length);
  if (absoluteScenes[0]) {
    console.log('[render] scene 0 audio_path:', absoluteScenes[0].audio_path);
    console.log('[render] scene 0 image_path:', absoluteScenes[0].image_path);
  }

  // Sync selected clip files to remotion/public/clips/
  if (selectedClips && Object.keys(selectedClips).length > 0) {
    const remotionClipsDir = path.resolve(PROJECT_ROOT, 'remotion/public/clips');
    if (!fs.existsSync(remotionClipsDir)) fs.mkdirSync(remotionClipsDir, { recursive: true });
    for (const clip of Object.values(selectedClips)) {
      if (!clip?.file) continue;
      const src  = toAbsPath(clip.file);
      const dest = path.join(remotionClipsDir, path.basename(src));
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        try { fs.copyFileSync(src, dest); } catch { /* skip */ }
      }
    }
  }

  // Build imagePaths map for Documentary composition
  const imagePaths = {};
  absoluteScenes.forEach(s => { if (s.image_path) imagePaths[s.scene_id] = s.image_path; });

  // Write props file for Remotion CLI
  const renderProps = {
    scenes:        absoluteScenes,
    imagePaths,
    selectedClips: selectedClips || {},
    audioSpecs,
  };
  fs.writeFileSync(propsPath, JSON.stringify(renderProps, null, 2));

  // Build render command
  const remotionDir = path.resolve(PROJECT_ROOT, 'remotion');
  const command = [
    'npx remotion render',
    'src/index.jsx',
    'Documentary',
    `"${outputPath}"`,
    `--props="${propsPath}"`,
    '--log=verbose',
  ].join(' ');

  console.log('[render] command:', command);

  // Stream progress via SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ type: 'start', message: 'Render starting...' });

  const renderProcess = exec(command, { cwd: remotionDir });

  const parseProgress = (text) => {
    // Strip ANSI codes
    const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
    const pct   = clean.match(/(\d+(?:\.\d+)?)%/);
    const frame = clean.match(/Frame (\d+)\/(\d+)/i) || clean.match(/(\d+)\/(\d+) frames/i);
    if (pct || frame) {
      send({
        type:        'progress',
        percent:     pct   ? Math.min(99, Math.round(parseFloat(pct[1]))) : null,
        frame:       frame ? parseInt(frame[1]) : null,
        totalFrames: frame ? parseInt(frame[2]) : null,
      });
    }
  };

  renderProcess.stdout.on('data', (d) => parseProgress(d.toString()));
  renderProcess.stderr.on('data', (d) => parseProgress(d.toString()));

  renderProcess.on('close', (code) => {
    if (code === 0 && fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      send({
        type:       'done',
        outputPath: `/output/${projectId}/output/final.mp4`,
        fileSize:   stats.size,
        fileSizeMB: Math.round(stats.size / 1024 / 1024 * 10) / 10,
      });
      console.log('[render] done —', Math.round(stats.size / 1024 / 1024 * 10) / 10, 'MB');
    } else {
      send({ type: 'error', message: `Render process exited with code ${code}` });
      console.error('[render] failed with code', code);
    }
    res.end();
  });

  renderProcess.on('error', (err) => {
    send({ type: 'error', message: err.message });
    res.end();
  });
});

// DELETE /api/render/:projectId — cancel an in-progress render (no-op in simple)
router.delete('/:projectId', (req, res) => {
  res.json({ ok: true, message: 'Cancel not supported in simple mode' });
});

module.exports = router;
