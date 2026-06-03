const router = require('express').Router();
const { analyzeScript } = require('../services/claude');

router.post('/', async (req, res) => {
  const { script, metadata } = req.body;

  if (!script?.trim()) {
    return res.status(400).json({ error: 'script is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in .env' });
  }

  try {
    const scenes = await analyzeScript({ script, metadata: metadata || {} });
    res.json({ scenes });
  } catch (err) {
    console.error('analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
