require('dotenv').config({ path: '../.env' });

// Startup tasks — must run before any middleware or routes load
const { setupHiggsfieldCredentials }                      = require('./scripts/setupHiggsfield');
const { ensureDirectories, syncClipsToRemotion, checkDependencies } = require('./scripts/startup');
setupHiggsfieldCredentials();
ensureDirectories();
syncClipsToRemotion();
checkDependencies();

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const { execSync } = require('child_process');

// Lightweight deps check — return value used by /api/health and /api/deps
function checkDeps() {
  let ytdlp = false, ffmpeg = false;
  try { execSync('yt-dlp --version', { stdio: 'pipe' }); ytdlp = true; } catch {}
  try { execSync('ffmpeg -version',  { stdio: 'pipe' }); ffmpeg = true; } catch {}
  return { ytdlp, ffmpeg };
}
const DEPS = checkDeps();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// Serve generated project assets (images, etc.)
app.use('/projects', express.static(path.join(__dirname, '../projects')));

// Serve library assets (clips, thumbnails)
const libraryPath = path.resolve(__dirname, '..', 'library');
const libraryClipsPath = path.join(libraryPath, 'clips');
console.log('[static] serving library from:', libraryPath);
if (!fs.existsSync(libraryClipsPath)) {
  fs.mkdirSync(libraryClipsPath, { recursive: true });
  console.log('[static] created library/clips folder');
}
app.use('/library', express.static(libraryPath));

// /clips — serves library/clips/ directly so staticFile('clips/...') in the
// Remotion <Player> (browser preview) resolves correctly via the Vite proxy.
app.use('/clips', express.static(libraryClipsPath));

// /output — clean URL for MP4 downloads; forces browser download for .mp4 files
app.use('/output', express.static(path.join(__dirname, '../projects'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Disposition', 'attachment; filename="documentary.mp4"');
      res.setHeader('Content-Type', 'video/mp4');
    }
  },
}));

// Confirm env loaded
const apiKeyLoaded = !!process.env.ANTHROPIC_API_KEY;
console.log(`ANTHROPIC_API_KEY loaded: ${apiKeyLoaded}`);

// Health check — Railway uses this to verify the container is ready.
// Must be registered BEFORE basicAuth so the probe works without credentials.
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    uptime:    process.uptime(),
    env:       process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Basic auth — protects all routes in production (skips /health automatically)
const basicAuth = require('./middleware/basicAuth');
app.use(basicAuth);

// Routes (stubs — wired in Phase 1)
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/analyze',       require('./routes/analyze'));
app.use('/api/generate',      require('./routes/generate'));
app.use('/api/motion',        require('./routes/motion'));
app.use('/api/library',       require('./routes/library'));
app.use('/api/voiceover',     require('./routes/voiceover'));
app.use('/api/render',        require('./routes/render'));
app.use('/api/clips',        require('./routes/clips'));
app.use('/api/research',     require('./routes/research'));
app.use('/api/script-writer', require('./routes/scriptWriter'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', anthropic_key: apiKeyLoaded, deps: DEPS });
});

app.get('/api/deps', (req, res) => {
  res.json(DEPS);
});

// Serve built React client in production — must come AFTER all API routes so
// /api/* requests are handled by the routers above, not caught by the SPA fallback.
const CLIENT_BUILD = path.resolve(__dirname, '../client/dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(CLIENT_BUILD)) {
  app.use(express.static(CLIENT_BUILD));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') ||
        req.path.startsWith('/projects') ||
        req.path.startsWith('/library') ||
        req.path.startsWith('/output')) {
      return next();
    }
    res.sendFile(path.join(CLIENT_BUILD, 'index.html'));
  });
  console.log('[server] serving React client from:', CLIENT_BUILD);
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Vorta server running on http://localhost:${PORT}`);
});
