const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const { generateImage, MODELS } = require('./higgsfield');
const { composeThumbnail, FONT_CONFIG } = require('./thumbnailComposer');

const THUMBNAILS_DIR = path.resolve(__dirname, '..', '..', 'library', 'thumbnails');

const VALID_STRATEGIES = ['curiosity_gap', 'contrarian_claim', 'number_driven', 'direct_claim', 'shock_framing'];
const VALID_FONTS = Object.keys(FONT_CONFIG);

function parseClaudeJson(text) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(stripped); } catch {}
  const match = stripped.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (match) return JSON.parse(match[0]);
  throw new Error('Claude returned invalid JSON');
}

function downloadFile(url, destPath) {
  const mod = url.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); try { fs.unlinkSync(destPath); } catch {}
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close(); try { fs.unlinkSync(destPath); } catch {}
        return reject(new Error(`Download failed: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

function buildNaturalHistory(versions, type) {
  return (versions || [])
    .filter(v => v.type === type && v.instruction)
    .flatMap(v => {
      const userMsg = { role: 'user', content: v.instruction };
      const reply = v.data?.assistantReply;
      if (reply) return [userMsg, { role: 'assistant', content: reply }];
      return [userMsg];
    });
}

// --- Title chat ---

async function chatEditTitle(briefId, message, conversationHistory, briefContext) {
  const client = new Anthropic();

  const messages = [
    ...conversationHistory,
    { role: 'user', content: message },
  ];

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are a YouTube title strategist. The user is iterating on title candidates for a documentary video. You have a persistent memory of this conversation — reference prior turns when the user says things like "the second one", "like before", "go back to", etc.

Context:
- Idea: ${briefContext.idea || ''}
- Angle: ${briefContext.angle || ''}
- Niche: ${briefContext.niche || ''}
- Current selected title: "${briefContext.selectedTitle || ''}"
- Current candidates: ${JSON.stringify(briefContext.titleCandidates || [])}

When the user asks you to revise titles, return BOTH:
1. A short natural-language reply explaining what you changed and why
2. Updated title candidates (6-8 titles)

Return valid JSON only:
{"assistantReply":"short explanation","titles":[{"text":"...","strategy":"curiosity_gap|contrarian_claim|number_driven|direct_claim|shock_framing"}]}`,
    messages,
  });

  const text = resp.content[0].text.trim();
  const parsed = parseClaudeJson(text);

  let titles = Array.isArray(parsed.titles) ? parsed.titles : [];
  titles = titles.map(t => ({
    text: typeof t.text === 'string' ? t.text.trim() : String(t.text || ''),
    strategy: VALID_STRATEGIES.includes(t.strategy) ? t.strategy : 'direct_claim',
  })).filter(t => t.text);

  return {
    titles,
    assistantReply: parsed.assistantReply || 'Here are the revised titles.',
  };
}

// --- Intent classification ---

async function classifyIntent(message, currentState) {
  const client = new Anthropic();

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `You classify user instructions for a YouTube thumbnail editor into exactly one category. Return only valid JSON.

Current thumbnail state:
- Image prompt: "${currentState.thumbnailPrompt || 'none'}"
- Overlay text: "${currentState.overlayState?.text || 'none'}"
- Font: ${currentState.overlayState?.fontFamily || 'anton'}
- Position: x=${currentState.overlayState?.x ?? 0.5}, y=${currentState.overlayState?.y ?? 0.5}

Categories:
- edit_image: changes to the generated scene (background, subject, composition, lighting, color, mood)
  Examples: "make the background darker", "remove the second person", "make it more dramatic", "change the lighting"
- edit_overlay: changes to the text layer (wording, font, size, position, color, stroke, uppercase, letter spacing, background pill)
  Examples: "change the text to say X", "make the font bigger", "move it to the top", "use a different font", "add a background box"
- restore: the user wants to undo, revert, or go back to a previous state
  Examples: "undo that", "go back to the previous version", "revert the last change", "what did it look like before", "undo", "go back", "revert"
- ambiguous: unclear what to change and not an undo request — ask a clarifying question
  Examples: "make it pop more", "make it better" with no clear target

Return: {"intent":"edit_image|edit_overlay|restore|ambiguous","clarifyingQuestion":"only if ambiguous"}`,
    messages: [{ role: 'user', content: message }],
  });

  const parsed = parseClaudeJson(resp.content[0].text.trim());
  const intent = ['edit_image', 'edit_overlay', 'restore', 'ambiguous'].includes(parsed.intent)
    ? parsed.intent : 'ambiguous';

  return {
    intent,
    clarifyingQuestion: intent === 'ambiguous'
      ? (parsed.clarifyingQuestion || 'Could you clarify — do you want to change the image itself or the text overlay?')
      : undefined,
  };
}

// --- Image editing ---

async function chatEditImage(briefId, message, currentPrompt, currentImagePath, conversationHistory) {
  const client = new Anthropic();

  const messages = [
    ...conversationHistory,
    {
      role: 'user',
      content: `CURRENT PROMPT:\n${currentPrompt}\n\nUSER INSTRUCTION: ${message}`,
    },
  ];

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `You rewrite Higgsfield image generation prompts for YouTube thumbnails. Given the current prompt and the user's edit instruction, produce a revised prompt that changes ONLY what the user asked for and explicitly preserves everything else. You have memory of prior edits in this conversation — use it to understand context like "make it even darker" or "go back to how it was before the last change".

RULES:
- Start with an explicit preservation clause: "Same composition, same subject placement and framing as before, same aspect ratio and camera angle."
- Then describe ONLY the specific change the user requested
- Keep the full scene description from the original prompt but modify only the relevant parts
- Maintain all composition rules: subject in left/right third, clean negative space for text, high contrast, nothing in bottom-right corner

Return valid JSON only:
{"prompt":"revised full prompt","assistantReply":"short explanation of what changed"}`,
    messages,
  });

  const parsed = parseClaudeJson(resp.content[0].text.trim());
  const revisedPrompt = parsed.prompt || currentPrompt;

  const absImagePath = path.resolve(__dirname, '..', '..', currentImagePath.replace(/^\//, ''));
  const hasRefImage = fs.existsSync(absImagePath);

  let imageUrl;
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const quoteCmdArg = (str) => {
      if (process.platform === 'win32') return '"' + str.replace(/"/g, '""') + '"';
      return "'" + str.replace(/'/g, "'\\''") + "'";
    };

    const cmdParts = [
      'higgsfield generate create',
      MODELS.default,
    ];
    if (hasRefImage) cmdParts.push('--image', quoteCmdArg(absImagePath));
    cmdParts.push('--prompt', quoteCmdArg(revisedPrompt));
    cmdParts.push('--aspect_ratio 16:9', '--resolution 2k', '--wait');

    const cmd = cmdParts.join(' ');
    console.log('[chatEditImage] CMD:', cmd);

    const result = await execAsync(cmd, { timeout: 360000 });
    const clean = result.stdout.replace(/\x1B\[[0-9;]*m/g, '');
    const urlLine = clean.split('\n').map(l => l.trim()).find(l => l.startsWith('http'));
    if (!urlLine) throw new Error('No URL in Higgsfield output');
    imageUrl = urlLine;
  } catch (err) {
    console.warn('[chatEditImage] image-reference generation failed, falling back to prompt-only:', err.message);
    imageUrl = await generateImage(revisedPrompt);
  }

  const briefDir = path.join(THUMBNAILS_DIR, briefId);
  if (!fs.existsSync(briefDir)) fs.mkdirSync(briefDir, { recursive: true });

  const filename = `edit_${Date.now()}.jpg`;
  const filePath = path.join(briefDir, filename);
  const relativePath = `/library/thumbnails/${briefId}/${filename}`;

  await downloadFile(imageUrl, filePath);

  return {
    imagePath: relativePath,
    prompt: revisedPrompt,
    assistantReply: parsed.assistantReply || 'Image updated.',
  };
}

// --- Overlay editing ---

async function chatEditOverlay(briefId, message, currentOverlayState, selectedBase, conversationHistory) {
  const client = new Anthropic();

  const stateDescription = JSON.stringify(currentOverlayState, null, 2);

  const messages = [
    ...conversationHistory,
    {
      role: 'user',
      content: `CURRENT STATE:\n${stateDescription}\n\nINSTRUCTION: ${message}`,
    },
  ];

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `You edit YouTube thumbnail text overlays. Given the current overlay state and the user's instruction, return an updated overlay state with ONLY the relevant fields changed. You have memory of prior edits — use it for context like "make it even bigger" or "change it back to what it was before".

Available fields and valid values:
- text: string (the overlay text)
- x: number 0-1 (horizontal position, 0=left, 1=right)
- y: number 0-1 (vertical position, 0=top, 1=bottom)
- fontSize: number (pixels, typically 48-120)
- color: hex string (text fill color)
- strokeColor: hex string (outline color)
- strokeWidth: number (outline thickness 0-12)
- fontFamily: "anton" | "inter" | "playfair" | "oswald"
- fontWeight: number (depends on font: anton=400, inter=700|900, playfair=700|900, oswald=700)
- italic: boolean
- uppercase: boolean
- letterSpacing: number (-4 to 20)
- backgroundPill: boolean (rounded rectangle behind text)
- backgroundPillColor: hex string
- backgroundPillOpacity: number 0-1

Return valid JSON only:
{"overlayState":{...full updated state...},"assistantReply":"short explanation"}`,
    messages,
  });

  const parsed = parseClaudeJson(resp.content[0].text.trim());
  const updated = parsed.overlayState || currentOverlayState;

  if (updated.fontFamily && !VALID_FONTS.includes(updated.fontFamily)) {
    updated.fontFamily = currentOverlayState.fontFamily || 'anton';
  }
  if (updated.fontFamily) {
    const cfg = FONT_CONFIG[updated.fontFamily];
    if (updated.fontWeight && !cfg.weights[updated.fontWeight]) {
      updated.fontWeight = cfg.defaultWeight;
    }
  }

  const basePath = path.resolve(__dirname, '..', '..', selectedBase.replace(/^\//, ''));
  const briefDir = path.join(THUMBNAILS_DIR, briefId);
  if (!fs.existsSync(briefDir)) fs.mkdirSync(briefDir, { recursive: true });

  const outputPath = path.join(briefDir, 'final_v1.jpg');
  const relativePath = `/library/thumbnails/${briefId}/final_v1.jpg`;

  const result = await composeThumbnail({
    basePath,
    text: updated.text || currentOverlayState.text || 'Untitled',
    x: updated.x ?? currentOverlayState.x ?? 0.5,
    y: updated.y ?? currentOverlayState.y ?? 0.5,
    fontSize: updated.fontSize || currentOverlayState.fontSize || undefined,
    color: updated.color || currentOverlayState.color || '#FFFFFF',
    strokeColor: updated.strokeColor || currentOverlayState.strokeColor || '#000000',
    strokeWidth: updated.strokeWidth !== undefined ? updated.strokeWidth : currentOverlayState.strokeWidth,
    fontFamily: updated.fontFamily || currentOverlayState.fontFamily || 'anton',
    fontWeight: updated.fontWeight || currentOverlayState.fontWeight || undefined,
    italic: updated.italic !== undefined ? updated.italic : (currentOverlayState.italic || false),
    uppercase: updated.uppercase !== undefined ? updated.uppercase : (currentOverlayState.uppercase !== undefined ? currentOverlayState.uppercase : true),
    letterSpacing: updated.letterSpacing !== undefined ? updated.letterSpacing : (currentOverlayState.letterSpacing || 0),
    backgroundPill: updated.backgroundPill !== undefined ? updated.backgroundPill : (currentOverlayState.backgroundPill || false),
    backgroundPillColor: updated.backgroundPillColor || currentOverlayState.backgroundPillColor || '#000000',
    backgroundPillOpacity: updated.backgroundPillOpacity !== undefined ? updated.backgroundPillOpacity : (currentOverlayState.backgroundPillOpacity ?? 0.6),
    outputPath,
  });

  updated.x = result.x;
  updated.y = result.y;

  return {
    overlayState: updated,
    finalImagePath: relativePath,
    assistantReply: parsed.assistantReply || 'Overlay updated.',
  };
}

module.exports = {
  chatEditTitle,
  classifyIntent,
  chatEditImage,
  chatEditOverlay,
  buildNaturalHistory,
};
