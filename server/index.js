require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// Raw binary body for audio file uploads — must come before JSON middleware on audio routes
app.use('/api/audio/upload', express.raw({ type: '*/*', limit: '200mb' }));

// Serve generated project assets (images, etc.)
app.use('/projects', express.static(path.join(__dirname, '../projects')));

// /output also serves the projects folder — clean URL for MP4 downloads
app.use('/output', express.static(path.join(__dirname, '../projects')));

// Confirm env loaded
const apiKeyLoaded = !!process.env.ANTHROPIC_API_KEY;
console.log(`ANTHROPIC_API_KEY loaded: ${apiKeyLoaded}`);

// Routes (stubs — wired in Phase 1)
app.use('/api/settings', require('./routes/settings'));
app.use('/api/analyze',  require('./routes/analyze'));
app.use('/api/generate', require('./routes/generate'));
app.use('/api/motion', require('./routes/motion'));
app.use('/api/library', require('./routes/library'));
app.use('/api/audio',  require('./routes/audio'));
app.use('/api/render', require('./routes/render'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', anthropic_key: apiKeyLoaded });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Vorta server running on http://localhost:${PORT}`);
});
