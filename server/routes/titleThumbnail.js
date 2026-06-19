const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const { generateThumbnail } = require('../services/higgsfield');
const { generateThumbnailPrompt } = require('../services/titleThumbnailService');
const { composeThumbnail } = require('../services/thumbnailComposer');

const LIBRARY_PATH = path.join(__dirname, '..', 'data', 'titleThumbnailLibrary.json');
const THUMBNAILS_DIR = path.resolve(__dirname, '..', '..', 'library', 'thumbnails');

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

// --- Image download helper ---
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`Download failed with status ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { fs.unlinkSync(destPath); reject(err); });
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// POST /api/title-thumbnail/generate-image
router.post('/generate-image', async (req, res) => {
  const { briefId, idea, angle, title, styleMode } = req.body;

  if (!briefId?.trim() || !idea?.trim() || !angle?.trim() || !title?.trim()) {
    return res.status(400).json({ error: 'briefId, idea, angle, and title are all required' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured — add it to .env' });
  }

  // Verify Higgsfield CLI is authenticated
  try {
    execSync('higgsfield account', { stdio: 'pipe', timeout: 15000 });
  } catch (err) {
    const detail = err.stderr?.toString().trim() || err.message;
    console.error('[title-thumbnail/generate-image] Higgsfield auth check failed:', detail.slice(0, 200));
    return res.status(500).json({ error: 'Higgsfield CLI not authenticated — run `higgsfield auth login`' });
  }

  try {
    // Step 1: Generate the thumbnail prompt via Claude
    const { prompt, styleMode: resolvedMode } = await generateThumbnailPrompt(
      idea.trim(), angle.trim(), title.trim(), styleMode || null
    );

    console.log(`[title-thumbnail/generate-image] prompt generated, styleMode=${resolvedMode}`);
    console.log(`[title-thumbnail/generate-image] prompt: ${prompt.slice(0, 200)}...`);

    // Step 2: Generate 3 variations via Higgsfield
    const results = await generateThumbnail(prompt, 3);

    // Step 3: Download successful images
    const briefDir = path.join(THUMBNAILS_DIR, briefId.trim());
    if (!fs.existsSync(briefDir)) fs.mkdirSync(briefDir, { recursive: true });

    const images = [];
    let failedCount = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.success || !r.url) {
        failedCount++;
        console.warn(`[title-thumbnail/generate-image] variation ${i + 1} failed:`, r.error);
        continue;
      }

      const filename = `base_v1_${i + 1}.jpg`;
      const filePath = path.join(briefDir, filename);
      const relativePath = `/library/thumbnails/${briefId.trim()}/${filename}`;

      try {
        await downloadFile(r.url, filePath);
        images.push({ path: relativePath, url: r.url });
        console.log(`[title-thumbnail/generate-image] saved variation ${i + 1}: ${relativePath}`);
      } catch (dlErr) {
        failedCount++;
        console.error(`[title-thumbnail/generate-image] download failed for variation ${i + 1}:`, dlErr.message);
      }
    }

    if (images.length === 0) {
      return res.status(500).json({ error: 'All thumbnail variations failed to generate' });
    }

    // Step 4: Update library entry
    try {
      const library = loadLibrary();
      const entry = library.find(e => e.briefId === briefId.trim());
      if (entry) {
        entry.styleMode = resolvedMode;
        entry.thumbnailPrompt = prompt;
        entry.baseImages = images.map(img => img.path);
        entry.status = 'thumbnailed';
        saveLibrary(library);
      }
    } catch (libErr) {
      console.error('[title-thumbnail/generate-image] library update failed:', libErr.message);
    }

    res.json({ images, styleMode: resolvedMode, prompt, failedCount });
  } catch (err) {
    console.error('[title-thumbnail/generate-image] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/title-thumbnail/compose
router.post('/compose', async (req, res) => {
  const { briefId, text, position, fontSize, color, strokeColor, strokeWidth } = req.body;

  if (!briefId?.trim()) {
    return res.status(400).json({ error: 'briefId is required' });
  }

  const library = loadLibrary();
  const entry = library.find(e => e.briefId === briefId.trim());
  if (!entry) {
    return res.status(400).json({ error: 'Brief not found' });
  }

  // Determine the selected base image — prefer the selectedThumbnail from the request
  // or fall back to the first base image in the library entry
  const selectedBase = req.body.selectedThumbnail || (entry.baseImages && entry.baseImages[0]);
  if (!selectedBase) {
    return res.status(400).json({ error: 'Generate a thumbnail image first' });
  }

  // Resolve relative path to absolute
  const basePath = path.resolve(__dirname, '..', '..', selectedBase.replace(/^\//, ''));
  if (!fs.existsSync(basePath)) {
    return res.status(400).json({ error: `Base image not found at ${selectedBase}` });
  }

  const overlayText = (text?.trim()) || entry.selectedTitle || 'Untitled';

  try {
    const briefDir = path.join(THUMBNAILS_DIR, briefId.trim());
    if (!fs.existsSync(briefDir)) fs.mkdirSync(briefDir, { recursive: true });

    const outputPath = path.join(briefDir, 'final_v1.jpg');
    const relativePath = `/library/thumbnails/${briefId.trim()}/final_v1.jpg`;

    await composeThumbnail({
      basePath,
      text: overlayText,
      position: position || 'left',
      fontSize: fontSize || undefined,
      color: color || '#FFFFFF',
      strokeColor: strokeColor || '#000000',
      strokeWidth: strokeWidth !== undefined ? strokeWidth : undefined,
      outputPath,
    });

    const overlayState = {
      text: overlayText,
      position: position || 'left',
      fontSize: fontSize || null,
      color: color || '#FFFFFF',
      strokeColor: strokeColor || '#000000',
      strokeWidth: strokeWidth !== undefined ? strokeWidth : null,
    };

    entry.overlayState = overlayState;
    entry.finalImagePath = relativePath;
    entry.status = 'composed';
    saveLibrary(library);

    console.log(`[title-thumbnail/compose] saved: ${relativePath}`);
    res.json({ finalImagePath: relativePath, overlayState });
  } catch (err) {
    console.error('[title-thumbnail/compose] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
