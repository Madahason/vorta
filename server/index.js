require('dotenv').config({ path: '../.env' });
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const fs        = require('fs');
const { execSync } = require('child_process');

function checkDeps() {
  let ytdlp = false, ffmpeg = false;
  try { execSync('yt-dlp --version', { stdio: 'pipe' }); ytdlp = true; } catch {}
  try { execSync('ffmpeg -version',  { stdio: 'pipe' }); ffmpeg = true; } catch {}
  console.log(`[deps] yt-dlp: ${ytdlp} | ffmpeg: ${ffmpeg}`);
  return { ytdlp, ffmpeg };
}
const DEPS = checkDeps();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve generated project assets (images, audio, etc.)
app.use('/projects', express.static(path.join(__dirname, '../projects')));

// Serve library clips
const libraryPath      = path.resolve(__dirname, '..', 'library');
const libraryClipsPath = path.join(libraryPath, 'clips');
console.log('[static] serving library/clips from:', libraryClipsPath);
if (!fs.existsSync(libraryClipsPath)) {
  fs.mkdirSync(libraryClipsPath, { recursive: true });
}
app.use('/library/clips', express.static(libraryClipsPath));

// /clips — serves library/clips/ directly for staticFile('clips/...') in Remotion Player
app.use('/clips', express.static(libraryClipsPath));

// One-time startup: sync library clips to remotion/public/clips/
function syncAllClipsToRemotion() {
  const remotionClipsDir = path.join(__dirname, '../remotion/public/clips');
  if (!fs.existsSync(libraryClipsPath)) return;
  if (!fs.existsSync(remotionClipsDir)) fs.mkdirSync(remotionClipsDir, { recursive: true });
  const clips = fs.readdirSync(libraryClipsPath).filter(f => /\.(mp4|webm|mov)$/i.test(f));
  let synced = 0;
  clips.forEach(filename => {
    const src  = path.join(libraryClipsPath, filename);
    const dest = path.join(remotionClipsDir, filename);
    if (!fs.existsSync(dest)) {
      try { fs.copyFileSync(src, dest); synced++; } catch { /* skip */ }
    }
  });
  console.log(`[startup] synced ${synced} new clips to remotion/public/clips (${clips.length} total)`);
}
syncAllClipsToRemotion();

// /output serves the projects folder for MP4 downloads
app.use('/output', express.static(path.join(__dirname, '../projects')));

const apiKeyLoaded = !!process.env.ANTHROPIC_API_KEY;
console.log(`ANTHROPIC_API_KEY loaded: ${apiKeyLoaded}`);

app.use('/api/settings',  require('./routes/settings'));
app.use('/api/analyze',   require('./routes/analyze'));
app.use('/api/generate',  require('./routes/generate'));
app.use('/api/motion',    require('./routes/motion'));
app.use('/api/library',   require('./routes/library'));
app.use('/api/voiceover', require('./routes/voiceover'));
app.use('/api/render',    require('./routes/render'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', anthropic_key: apiKeyLoaded, deps: DEPS });
});

app.get('/api/deps', (req, res) => {
  res.json(DEPS);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Vorta server running on http://localhost:${PORT}`);
});
