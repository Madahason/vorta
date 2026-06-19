const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

const LIBRARY_PATH = path.join(__dirname, '..', 'data', 'titleThumbnailLibrary.json');

const VALID_STRATEGIES = ['curiosity_gap', 'contrarian_claim', 'number_driven', 'direct_claim', 'shock_framing'];

function loadLibrary() {
  try {
    if (!fs.existsSync(LIBRARY_PATH)) return [];
    return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8'));
  } catch { return []; }
}

function saveLibrary(data) {
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function parseClaudeJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      return JSON.parse(stripped);
    } catch {
      const match = stripped.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Claude returned invalid JSON');
    }
  }
}

function sanitizeTitles(raw) {
  let titles = Array.isArray(raw) ? raw : (raw?.titles || []);

  titles = titles.map(t => {
    if (typeof t === 'string') return { text: t, strategy: 'direct_claim' };
    return {
      text: typeof t.text === 'string' ? t.text.trim() : String(t.text || 'Untitled'),
      strategy: VALID_STRATEGIES.includes(t.strategy) ? t.strategy : 'direct_claim',
    };
  }).filter(t => t.text && t.text !== 'Untitled');

  if (titles.length > 8) titles = titles.slice(0, 8);

  while (titles.length < 6) {
    titles.push({ text: `Alternative Title ${titles.length + 1}`, strategy: 'direct_claim' });
  }

  return titles;
}

// POST /api/title-thumbnail/generate-titles
router.post('/generate-titles', async (req, res) => {
  const { idea, angle, niche, targetAudience } = req.body;

  if (!idea?.trim() || !angle?.trim() || !niche?.trim()) {
    return res.status(400).json({ error: 'idea, angle, and niche are all required' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured — add it to .env' });
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `You are a YouTube title strategist specializing in documentary and educational content. Return only valid JSON. No markdown fences, no preamble, no explanation.`,
      messages: [{
        role: 'user',
        content: `Generate 6-8 YouTube title candidates for this video idea.

Idea: ${idea.trim()}
Angle: ${angle.trim()}
Niche: ${niche.trim()}
${targetAudience?.trim() ? `Target audience: ${targetAudience.trim()}` : ''}

RULES:
- Return exactly 6-8 title candidates
- Each title must be tagged with EXACTLY ONE strategy label from this list:
  curiosity_gap | contrarian_claim | number_driven | direct_claim | shock_framing
- Keep titles SHORT — avoid filler words, padding, or unnecessary qualifiers
- Titles should leave room for a complementary thumbnail text treatment
  (the title states the topic/angle; the eventual thumbnail text will add tension or a number, not repeat the title)
- Each title should be a genuinely different take, not minor word variations of the same title
- Prioritize titles that would make someone click in a YouTube feed

Return this exact JSON structure:
{"titles":[{"text":"string","strategy":"curiosity_gap"},{"text":"string","strategy":"direct_claim"}]}`,
      }],
    });

    const text = message.content[0].text.trim();
    const parsed = parseClaudeJson(text);
    const titles = sanitizeTitles(parsed.titles || parsed);

    res.json({ titles });
  } catch (err) {
    console.error('[title-thumbnail/generate-titles] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/title-thumbnail/brief/save
router.post('/brief/save', async (req, res) => {
  const { idea, angle, niche, targetAudience, titleCandidates, selectedTitle, linkedVrIdeaId } = req.body;

  if (!idea?.trim() || !angle?.trim() || !niche?.trim()) {
    return res.status(400).json({ error: 'idea, angle, and niche are all required' });
  }
  if (!selectedTitle?.trim()) {
    return res.status(400).json({ error: 'selectedTitle is required' });
  }

  const briefId = `tt_${Date.now()}`;
  const entry = {
    briefId,
    createdAt: new Date().toISOString(),
    idea: idea.trim(),
    angle: angle.trim(),
    niche: niche.trim(),
    targetAudience: (targetAudience || '').trim(),
    titleCandidates: Array.isArray(titleCandidates) ? titleCandidates : [],
    selectedTitle: selectedTitle.trim(),
    linkedVrIdeaId: linkedVrIdeaId || null,
    status: 'titled',
  };

  try {
    const library = loadLibrary();
    library.push(entry);
    saveLibrary(library);
    res.json({ briefId });
  } catch (err) {
    console.error('[title-thumbnail/brief/save] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
