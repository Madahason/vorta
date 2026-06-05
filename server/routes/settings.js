const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const { exec } = require('child_process');

const DEFAULTS_PATH = path.resolve(__dirname, '../config/defaults.json');

function loadDefaults() {
  try {
    return JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8'));
  } catch {
    return { style: {}, render: {} };
  }
}

// ── GET / — return current settings ──────────────────────────────────────────
router.get('/', (req, res) => {
  const defaults = loadDefaults();
  const anthropicKeySet = !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_key_here');
  res.json({
    defaults,
    anthropicKeySet,
  });
});

// ── POST / — save settings ────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { defaults } = req.body;
  if (!defaults || typeof defaults !== 'object') {
    return res.status(400).json({ error: 'defaults object required' });
  }
  try {
    const current  = loadDefaults();
    const merged   = {
      style:  { ...current.style,  ...(defaults.style  || {}) },
      render: { ...current.render, ...(defaults.render || {}) },
    };
    fs.writeFileSync(DEFAULTS_PATH, JSON.stringify(merged, null, 2));
    res.json({ success: true, defaults: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /higgsfield-status — check Higgsfield CLI auth ────────────────────────
router.get('/higgsfield-status', (req, res) => {
  exec('higgsfield account', { timeout: 15000, env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' } }, (err, stdout, stderr) => {
    if (err) {
      const msg = (stderr || err.message || '').toLowerCase();
      const notAuth = msg.includes('not logged') || msg.includes('login') || msg.includes('auth') || msg.includes('unauthorized');
      return res.json({ authenticated: false, message: notAuth ? 'Not authenticated — run: higgsfield auth login' : (stderr || err.message).trim() });
    }
    const output = stdout.trim();
    res.json({ authenticated: true, message: output });
  });
});

// ── POST /test-anthropic — fire a minimal Claude call to verify key ───────────
router.post('/test-anthropic', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'your_key_here') {
    return res.status(400).json({ success: false, error: 'ANTHROPIC_API_KEY not set in .env' });
  }
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client    = new Anthropic();
    const msg       = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say OK' }],
    });
    res.json({ success: true, model: msg.model });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.loadDefaults = loadDefaults;
