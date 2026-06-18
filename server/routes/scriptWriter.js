const express = require('express');
const router = express.Router();
const {
  researchPass,
  anglesPass,
  structurePass,
  scriptPass,
  retentionPass,
  humanizationPass,
  antiDetectionPass,
  originalityScanPass,
  analyzeVoiceProfile,
  loadVoiceProfiles,
  saveVoiceProfiles,
  loadScriptHistory,
  saveScriptHistory,
  saveScriptToHistory
} = require('../services/scriptWriterService');

router.get('/voice-profiles', (req, res) => {
  res.json(loadVoiceProfiles());
});

router.post('/voice-profiles', async (req, res) => {
  try {
    const { name, transcripts } = req.body;
    if (!name || !transcripts || !transcripts.length) {
      return res.status(400).json({ error: 'name and transcripts required' });
    }
    const profile = await analyzeVoiceProfile(name, transcripts);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/voice-profiles/:id', (req, res) => {
  const profiles = loadVoiceProfiles();
  const filtered = profiles.filter(p => p.id !== req.params.id);
  saveVoiceProfiles(filtered);
  res.json({ ok: true });
});

router.post('/generate', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { topic, styleTemplate, targetLength } = req.body;

    const researchBrief = await researchPass(topic, send);
    const angles = await anglesPass(topic, styleTemplate, researchBrief, send);

    send({ pass: 'waiting_for_angle', status: 'waiting', data: angles });
    res.end();
  } catch (err) {
    send({ pass: 'error', error: err.message });
    res.end();
  }
});

router.post('/generate-from-angle', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { topic, styleTemplate, targetLength, voiceProfileId, chosenAngle, researchBrief } = req.body;

    let voiceProfile = null;
    if (voiceProfileId) {
      const profiles = loadVoiceProfiles();
      voiceProfile = profiles.find(p => p.id === voiceProfileId) || null;
    }

    const structure = await structurePass(topic, styleTemplate, chosenAngle, researchBrief, targetLength, send);
    const draft = await scriptPass(topic, styleTemplate, chosenAngle, researchBrief, structure, targetLength, voiceProfile, send);
    const retained = await retentionPass(draft, targetLength, send);
    const humanized = await humanizationPass(retained, voiceProfile, styleTemplate, send);
    const deAIed = await antiDetectionPass(humanized, send);
    const scanResult = await originalityScanPass(deAIed, send);

    const historyEntry = {
      id: `script_${Date.now()}`,
      topic,
      styleTemplate,
      targetLength,
      voiceProfileId: voiceProfileId || null,
      chosenAngle,
      script: deAIed,
      scanResult: scanResult || null,
      rating: null,
      usedCount: 0,
      createdAt: new Date().toISOString(),
      wordCount: deAIed.split(/\s+/).length
    };
    saveScriptToHistory(historyEntry);

    send({ pass: 'complete', status: 'complete', script: deAIed, scanResult, historyId: historyEntry.id });
    res.end();
  } catch (err) {
    send({ pass: 'error', error: err.message });
    res.end();
  }
});

// --- History routes ---

router.get('/history', (req, res) => {
  const history = loadScriptHistory();
  const summaries = history.map(({ id, topic, styleTemplate, targetLength, rating, usedCount, createdAt, wordCount, scanResult, chosenAngle }) => ({
    id, topic, styleTemplate, targetLength, rating, usedCount, createdAt, wordCount,
    scanResult: scanResult ? {
      originality: scanResult.originality,
      aiScore: scanResult.aiScore,
      skipped: scanResult.skipped
    } : null,
    angleTitle: chosenAngle?.title || null
  }));
  res.json(summaries);
});

router.get('/history/:id', (req, res) => {
  const history = loadScriptHistory();
  const entry = history.find(s => s.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json(entry);
});

router.patch('/history/:id/rating', (req, res) => {
  const { rating } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be 1-5' });
  }
  const history = loadScriptHistory();
  const entry = history.find(s => s.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  entry.rating = rating;
  saveScriptHistory(history);
  res.json({ ok: true, rating });
});

router.patch('/history/:id/used', (req, res) => {
  const history = loadScriptHistory();
  const entry = history.find(s => s.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  entry.usedCount = (entry.usedCount || 0) + 1;
  saveScriptHistory(history);
  res.json({ ok: true, usedCount: entry.usedCount });
});

router.delete('/history/:id', (req, res) => {
  const history = loadScriptHistory();
  const filtered = history.filter(s => s.id !== req.params.id);
  saveScriptHistory(filtered);
  res.json({ ok: true });
});

module.exports = router;
