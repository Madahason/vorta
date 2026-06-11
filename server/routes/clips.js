const express = require('express');
const router  = express.Router();
const { autoSourceAllClips } = require('../services/autoClipper');

// POST /api/clips/auto-source — SSE stream; sources real_footage clips for a project
router.post('/auto-source', async (req, res) => {
  const { scenes, projectId } = req.body;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { selectedClips, convertToImage } = await autoSourceAllClips(scenes, projectId, send);
    send({ type: 'complete', selectedClips, convertToImage });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
});

module.exports = router;
