const router = require('express').Router();
const { analyzeScript } = require('../services/claude');
const { loadDefaults }  = require('./settings');

router.post('/', async (req, res) => {
  const { script, metadata } = req.body;

  if (!script?.trim()) {
    return res.status(400).json({ error: 'script is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured — add it to .env' });
  }

  try {
    const defaults = loadDefaults();
    const scenes   = await analyzeScript({ script, metadata: metadata || {}, defaults });
    res.json({ scenes });
  } catch (err) {
    console.error('analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
