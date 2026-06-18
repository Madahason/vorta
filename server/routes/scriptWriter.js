const express = require('express');
const router = express.Router();
const {
  researchPass,
  anglesPass,
  structurePass,
  scriptPass,
  retentionPass,
  humanizationPass,
  analyzeVoiceProfile,
  loadVoiceProfiles,
  saveVoiceProfiles
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
    const finalScript = await humanizationPass(retained, voiceProfile, send);

    send({ pass: 'complete', status: 'complete', script: finalScript });
    res.end();
  } catch (err) {
    send({ pass: 'error', error: err.message });
    res.end();
  }
});

module.exports = router;
