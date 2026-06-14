const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { sourceAllStockClips, searchPexels, searchPixabay, downloadStockClip } = require('../services/stockFootage');

// POST /api/clips/auto-source — stock footage sourcing via Pexels + Pixabay
router.post('/auto-source', async (req, res) => {
  const { scenes, projectId } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { selectedClips, fallbackToImage } = await sourceAllStockClips(scenes, projectId, send);
    send({ type: 'complete', selectedClips, fallbackToImage });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
});

// GET /api/clips/search — search stock footage
router.get('/search', async (req, res) => {
  const { query, source = 'both' } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    const results = [];

    if (source === 'both' || source === 'pexels') {
      const pexels = await searchPexels(query, 8);
      results.push(...pexels);
    }
    if (source === 'both' || source === 'pixabay') {
      const pixabay = await searchPixabay(query, 8);
      results.push(...pixabay);
    }

    res.json({ results, count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clips/download — download a specific stock clip
router.post('/download', async (req, res) => {
  const { result } = req.body;
  if (!result || !result.downloadUrl) {
    return res.status(400).json({ error: 'result.downloadUrl required' });
  }

  try {
    const safeTitle = (result.title || 'clip').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30).toLowerCase();
    const filename = `${result.id}_${safeTitle}.mp4`;
    await downloadStockClip(result, filename);
    res.json({ success: true, filename, file: `/library/clips/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clips/status — stock footage system status
router.get('/status', (req, res) => {
  const pexelsOk = !!(process.env.PEXELS_API_KEY && process.env.PEXELS_API_KEY !== 'your_pexels_api_key_here');
  const pixabayOk = !!(process.env.PIXABAY_API_KEY && process.env.PIXABAY_API_KEY !== 'your_pixabay_api_key_here');
  const clipsDir = path.resolve(__dirname, '../../library/clips');
  const clipCount = fs.existsSync(clipsDir)
    ? fs.readdirSync(clipsDir).filter(f => f.endsWith('.mp4')).length
    : 0;

  res.json({
    pexels: { connected: pexelsOk, name: 'Pexels' },
    pixabay: { connected: pixabayOk, name: 'Pixabay' },
    clipCount,
    youtubeSystem: 'disabled'
  });
});

module.exports = router;
