const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');

// ── POST /upload?projectId=xxx — receive raw audio file ──────────────────────
// Client sends file as raw binary body with Content-Type: audio/* or application/octet-stream
// and X-Filename header for the original filename.
router.post('/upload', (req, res) => {
  const { projectId } = req.query;
  const originalName  = req.headers['x-filename'] || 'narration.mp3';

  if (!projectId) {
    return res.status(400).json({ error: 'projectId query param required' });
  }

  const audioDir  = path.resolve(__dirname, `../../projects/${projectId}/audio`);
  const ext       = path.extname(originalName).toLowerCase() || '.mp3';
  const dest      = path.join(audioDir, `narration${ext}`);
  const urlPath   = `/projects/${projectId}/audio/narration${ext}`;

  try {
    fs.mkdirSync(audioDir, { recursive: true });
    fs.writeFileSync(dest, req.body);
    const stats = fs.statSync(dest);
    res.json({
      success:    true,
      path:       urlPath,
      filename:   `narration${ext}`,
      size:       stats.size,
      savedAt:    dest,
    });
  } catch (err) {
    console.error('[audio] upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /info?projectId=xxx — check if audio file exists ─────────────────────
router.get('/info', (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const audioDir = path.resolve(__dirname, `../../projects/${projectId}/audio`);
  const exts     = ['.mp3', '.wav', '.m4a', '.aac'];
  let found      = null;

  for (const ext of exts) {
    const p = path.join(audioDir, `narration${ext}`);
    if (fs.existsSync(p)) {
      const stats = fs.statSync(p);
      found = { path: `/projects/${projectId}/audio/narration${ext}`, size: stats.size, ext };
      break;
    }
  }

  res.json({ exists: !!found, ...(found || {}) });
});

module.exports = router;
