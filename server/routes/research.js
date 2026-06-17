const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');

// POST /api/research/suggestions
router.post('/suggestions', async (req, res) => {
  const { niche, subFocus } = req.body;

  if (!niche?.trim() || !subFocus?.trim()) {
    return res.status(400).json({ error: 'Both niche and subFocus are required' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured — add it to .env' });
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: 'You are a YouTube content strategist. Return only valid JSON. No markdown fences, no preamble, no explanation.',
      messages: [{
        role: 'user',
        content: `Given this YouTube niche and sub-focus, suggest 5 editorial angles and 5 tones.

Niche: ${niche.trim()}
Sub-focus: ${subFocus.trim()}

Rules:
- Return exactly 5 angles and 5 tones
- Each option must be specific and differentiated — not generic variations of the same idea
- Each option is a short label followed by a dash and a one-line description of what it means in practice
- Angles describe the editorial perspective or lens through which content is created
- Tones describe the voice, mood, and feel of the delivery

Return this exact JSON structure:
{"angles":["string","string","string","string","string"],"tones":["string","string","string","string","string"]}`
      }],
    });

    const text = message.content[0].text.trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Claude returned invalid JSON for suggestions');
      }
    }

    if (!Array.isArray(parsed.angles) || !Array.isArray(parsed.tones)) {
      throw new Error('Invalid suggestion format — expected angles and tones arrays');
    }

    res.json({
      angles: parsed.angles.filter(a => typeof a === 'string' && a.trim()).slice(0, 5),
      tones: parsed.tones.filter(t => typeof t === 'string' && t.trim()).slice(0, 5),
    });
  } catch (err) {
    console.error('[research/suggestions] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/research/profile/fresh
router.post('/profile/fresh', async (req, res) => {
  const { niche, subFocus, angle, tone, competitors } = req.body;

  if (!niche?.trim() || !subFocus?.trim() || !angle?.trim() || !tone?.trim()) {
    return res.status(400).json({ error: 'All fields are required: niche, subFocus, angle, tone' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured — add it to .env' });
  }

  try {
    const profile = await synthesizeFreshProfile({ niche, subFocus, angle, tone, competitors: competitors || [] });
    res.json(profile);
  } catch (err) {
    console.error('[research/fresh] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/research/profile/existing
router.post('/profile/existing', async (req, res) => {
  const { channelUrl, competitors } = req.body;

  if (!channelUrl?.trim()) {
    return res.status(400).json({ error: 'channelUrl is required' });
  }

  if (!process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY === '') {
    return res.status(400).json({ error: 'YOUTUBE_API_KEY not configured — add it to .env' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured — add it to .env' });
  }

  try {
    const channelId = await resolveChannelId(channelUrl);
    if (!channelId) {
      return res.status(404).json({ error: 'Channel not found. Check the URL and try again.' });
    }

    const channelInfo = await getChannelInfo(channelId);
    const tier1 = await getAllVideoTitles(channelId);
    const tier2 = await getTopVideos(channelId, 20);
    const tier3 = await getRecentVideos(channelId, 30);

    const profile = await synthesizeExistingProfile({
      channelName: channelInfo.title,
      tier1,
      tier2,
      tier3,
      competitors: competitors || [],
    });

    res.json(profile);
  } catch (err) {
    console.error('[research/existing] error:', err.message);
    if (err.message.includes('not found') || err.message.includes('404') || err.message.includes('YouTube API error')) {
      return res.status(404).json({ error: 'Channel not found or YouTube API error. Check the URL and try again.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// --- YouTube API helpers ---

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

async function ytFetch(endpoint, params) {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  params.key = process.env.YOUTUBE_API_KEY;
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`YouTube API error ${resp.status}: ${body.slice(0, 300)}`);
  }
  return resp.json();
}

async function resolveChannelId(channelUrl) {
  const url = channelUrl.trim();

  const channelMatch = url.match(/\/channel\/(UC[\w-]+)/);
  if (channelMatch) return channelMatch[1];

  const handleMatch = url.match(/\/@([\w.-]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    try {
      const data = await ytFetch('search', {
        part: 'snippet',
        q: `@${handle}`,
        type: 'channel',
        maxResults: 1,
      });
      if (data.items?.length > 0) {
        return data.items[0].snippet.channelId;
      }
    } catch {}
    return null;
  }

  try {
    const data = await ytFetch('search', {
      part: 'snippet',
      q: url,
      type: 'channel',
      maxResults: 1,
    });
    if (data.items?.length > 0) {
      return data.items[0].snippet.channelId;
    }
  } catch {}

  return null;
}

async function getChannelInfo(channelId) {
  const data = await ytFetch('channels', {
    part: 'snippet,statistics',
    id: channelId,
  });
  if (!data.items?.length) throw new Error('Channel not found');
  const ch = data.items[0];
  return {
    title: ch.snippet.title,
    description: ch.snippet.description,
    subscriberCount: parseInt(ch.statistics.subscriberCount || '0'),
    videoCount: parseInt(ch.statistics.videoCount || '0'),
  };
}

async function getAllVideoTitles(channelId) {
  const titles = [];
  let pageToken = undefined;
  for (let page = 0; page < 20; page++) {
    const params = {
      part: 'snippet',
      channelId,
      maxResults: 50,
      order: 'date',
      type: 'video',
    };
    if (pageToken) params.pageToken = pageToken;
    const data = await ytFetch('search', params);
    for (const item of (data.items || [])) {
      titles.push(item.snippet.title);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return titles;
}

async function getTopVideos(channelId, count) {
  const searchData = await ytFetch('search', {
    part: 'snippet',
    channelId,
    maxResults: count,
    order: 'viewCount',
    type: 'video',
  });

  const videoIds = (searchData.items || []).map(i => i.id.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  const videoData = await ytFetch('videos', {
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
  });

  return (videoData.items || []).map(v => ({
    title: v.snippet.title,
    description: v.snippet.description?.slice(0, 500) || '',
    tags: v.snippet.tags || [],
    viewCount: parseInt(v.statistics.viewCount || '0'),
    duration: v.contentDetails.duration,
    publishedAt: v.snippet.publishedAt,
  }));
}

async function getRecentVideos(channelId, count) {
  const searchData = await ytFetch('search', {
    part: 'snippet',
    channelId,
    maxResults: count,
    order: 'date',
    type: 'video',
  });

  const videoIds = (searchData.items || []).map(i => i.id.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  const videoData = await ytFetch('videos', {
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
  });

  return (videoData.items || []).map(v => ({
    title: v.snippet.title,
    description: v.snippet.description?.slice(0, 500) || '',
    tags: v.snippet.tags || [],
    viewCount: parseInt(v.statistics.viewCount || '0'),
    duration: v.contentDetails.duration,
    publishedAt: v.snippet.publishedAt,
  }));
}

// --- Claude synthesis ---

async function synthesizeFreshProfile({ niche, subFocus, angle, tone, competitors }) {
  const client = new Anthropic();
  const systemPrompt = `You are a YouTube channel strategist. You analyse niches, competitors, and content angles to build comprehensive channel profiles. Always respond with valid JSON only — no markdown, no explanation.`;

  const userPrompt = `Build a Channel Profile for a NEW YouTube channel with these inputs:

Niche: ${niche}
Sub-focus: ${subFocus}
Angle: ${angle}
Tone: ${tone}
Competitors: ${competitors.join(', ') || 'none specified'}

Since this is a fresh channel with no existing content, populate the profile based on your knowledge of the niche landscape.

Return this exact JSON structure:
{
  "channelName": "${niche} Channel",
  "niche": "${niche}",
  "subFocus": "${subFocus}",
  "angle": "${angle}",
  "tone": "${tone}",
  "competitors": ${JSON.stringify(competitors)},
  "catalog": [],
  "performanceFingerprint": {
    "topTopics": ["array of 5-8 topics that consistently perform well in this niche"],
    "winningFormats": ["array of 3-5 narrative styles or formats that work in this niche"],
    "avgViewsTop20": 0,
    "bestPerformingTitle": "example title that would perform well"
  },
  "currentDirection": {
    "recentTopics": ["array of 5-8 trending topics in this niche right now"],
    "editorialShift": "description of current trends and shifts in this niche"
  },
  "channelVoice": "2-3 sentence synthesis of the channel's editorial POV based on the stated angle and tone",
  "gaps": ["array of 3-6 content gap observations in this niche that a new channel could exploit"]
}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = message.content[0].text.trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Claude returned invalid JSON for channel profile');
    }
  }

  return {
    profileId: `prof_${Date.now()}`,
    createdAt: new Date().toISOString(),
    path: 'fresh',
    ...parsed,
  };
}

async function synthesizeExistingProfile({ channelName, tier1, tier2, tier3, competitors }) {
  const client = new Anthropic();
  const systemPrompt = `You are a YouTube channel analyst. You analyse video catalogs, performance data, and editorial patterns to build comprehensive channel profiles. Always respond with valid JSON only — no markdown, no explanation.`;

  const avgViews = tier2.length > 0
    ? Math.round(tier2.reduce((sum, v) => sum + v.viewCount, 0) / tier2.length)
    : 0;

  const bestVideo = tier2.length > 0
    ? tier2.reduce((best, v) => v.viewCount > best.viewCount ? v : best, tier2[0])
    : null;

  const userPrompt = `Analyse this YouTube channel and build a Channel Profile.

Channel: ${channelName}
Competitors: ${competitors.join(', ') || 'none specified'}

TIER 1 — Full video catalog (${tier1.length} titles for deduplication):
${tier1.slice(0, 200).join('\n')}
${tier1.length > 200 ? `\n... and ${tier1.length - 200} more titles` : ''}

TIER 2 — Top ${tier2.length} videos by views:
${tier2.map(v => `- "${v.title}" (${v.viewCount.toLocaleString()} views, ${v.publishedAt?.slice(0, 10) || 'unknown date'}) Tags: ${(v.tags || []).slice(0, 5).join(', ')}`).join('\n')}

TIER 3 — Most recent ${tier3.length} videos:
${tier3.map(v => `- "${v.title}" (${v.viewCount.toLocaleString()} views, ${v.publishedAt?.slice(0, 10) || 'unknown date'})`).join('\n')}

Return this exact JSON structure:
{
  "channelName": "${channelName}",
  "niche": "detected niche",
  "subFocus": "detected sub-focus",
  "angle": "detected editorial angle",
  "tone": "detected tone and style",
  "competitors": ${JSON.stringify(competitors)},
  "catalog": ${JSON.stringify(tier1.slice(0, 500))},
  "performanceFingerprint": {
    "topTopics": ["array of 5-8 topics that consistently perform well based on tier 2 data"],
    "winningFormats": ["array of 3-5 narrative styles or formats based on top performers"],
    "avgViewsTop20": ${avgViews},
    "bestPerformingTitle": "${bestVideo?.title || 'N/A'}"
  },
  "currentDirection": {
    "recentTopics": ["array of 5-8 topics from the last 30 videos"],
    "editorialShift": "description of any drift from historical pattern to recent content"
  },
  "channelVoice": "2-3 sentence synthesis of this channel's editorial POV and what makes it distinctive",
  "gaps": ["array of 3-6 content gap observations — topics the channel hasn't covered but should"]
}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = message.content[0].text.trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Claude returned invalid JSON for channel profile');
    }
  }

  return {
    profileId: `prof_${Date.now()}`,
    createdAt: new Date().toISOString(),
    path: 'existing',
    ...parsed,
  };
}

// --- Discovery endpoints ---

let discoveryRunning = false;

function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') return 'profile is required and must be an object';
  if (!profile.niche?.trim()) return 'profile.niche is required';
  if (!profile.subFocus?.trim()) return 'profile.subFocus is required';
  if (!profile.angle?.trim()) return 'profile.angle is required';
  if (!profile.tone?.trim()) return 'profile.tone is required';
  return null;
}

function parseClaudeJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Claude returned invalid JSON');
  }
}

function clampScore(val) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return 5;
  return Math.max(1, Math.min(10, n));
}

function filterCovered(items, catalog) {
  if (!catalog || catalog.length === 0) return items;
  const lower = catalog.map(t => t.toLowerCase());
  return items.filter(item => {
    if (item.alreadyCovered) return false;
    const title = (item.title || '').toLowerCase();
    return !lower.some(c => c.includes(title) || title.includes(c));
  });
}

function buildTrendingPrompt(profile) {
  return `Find 6-8 topics gaining momentum RIGHT NOW in this YouTube niche. Use web search to find current trends, news, and viral content.

Channel niche: ${profile.niche}
Sub-focus: ${profile.subFocus}
Channel angle: ${profile.angle}
Channel tone: ${profile.tone}
${profile.catalog?.length ? `\nExisting catalog (${profile.catalog.length} titles) — exclude any topic already covered:\n${profile.catalog.slice(0, 100).join('\n')}` : ''}

For each topic return:
- title (string)
- summary (1-2 sentences on why it's trending)
- trendSignal (what's driving the momentum — news event, viral video, earnings report, etc.)
- opportunityScore (1-10 integer, weight toward the channel's angle: "${profile.angle}")
- estimatedSearchVolume ("low" | "medium" | "high")
- alreadyCovered (boolean — true if the channel's catalog already has this topic)

Return ONLY valid JSON array. No markdown, no preamble.
[{"title":"...","summary":"...","trendSignal":"...","opportunityScore":8,"estimatedSearchVolume":"high","alreadyCovered":false}]`;
}

function buildGapsPrompt(profile) {
  return `Find 6-8 topics with genuine search demand but weak or outdated YouTube coverage in this niche. Use web search to verify current coverage quality.

Channel niche: ${profile.niche}
Sub-focus: ${profile.subFocus}
Channel angle: ${profile.angle}
Channel tone: ${profile.tone}
${profile.catalog?.length ? `\nExisting catalog (${profile.catalog.length} titles) — exclude any topic already covered:\n${profile.catalog.slice(0, 100).join('\n')}` : ''}

For each topic return:
- title (string)
- summary (1-2 sentences on the gap)
- gapReason (why existing coverage is weak — outdated, wrong angle, oversimplified, no coverage at all)
- opportunityScore (1-10 integer, weight toward the channel's angle: "${profile.angle}")
- estimatedSearchVolume ("low" | "medium" | "high")
- lastCoveredYear (integer or null if never covered well)
- alreadyCovered (boolean)

Return ONLY valid JSON array. No markdown, no preamble.
[{"title":"...","summary":"...","gapReason":"...","opportunityScore":8,"estimatedSearchVolume":"high","lastCoveredYear":2023,"alreadyCovered":false}]`;
}

function buildCompetitorsPrompt(profile) {
  const competitors = (profile.competitors || []).join(', ') || 'popular channels in this niche';
  return `Find 4-6 videos from these competitor YouTube channels that are currently overperforming. Use web search to find their recent high-performing content.

Competitor channels: ${competitors}
Channel niche: ${profile.niche}
Sub-focus: ${profile.subFocus}
Our channel angle: ${profile.angle}
Our channel tone: ${profile.tone}
${profile.catalog?.length ? `\nOur existing catalog (${profile.catalog.length} titles) — mark alreadyCovered true if we have similar content:\n${profile.catalog.slice(0, 100).join('\n')}` : ''}

For each video return:
- title (string)
- channel (string)
- summary (1-2 sentences on why it's performing)
- performanceReason (what made it work — timing, angle, format, topic gap)
- opportunityScore (1-10 integer, weight toward how well our angle "${profile.angle}" could differentiate)
- suggestedAngle (how our channel could cover the same topic differently)
- alreadyCovered (boolean)

Return ONLY valid JSON array. No markdown, no preamble.
[{"title":"...","channel":"...","summary":"...","performanceReason":"...","opportunityScore":8,"suggestedAngle":"...","alreadyCovered":false}]`;
}

function sanitizeItem(item, panelName) {
  const base = {
    title: item.title || 'Untitled',
    summary: item.summary || '',
    opportunityScore: clampScore(item.opportunityScore),
    estimatedSearchVolume: ['low', 'medium', 'high'].includes(item.estimatedSearchVolume) ? item.estimatedSearchVolume : 'medium',
    alreadyCovered: !!item.alreadyCovered,
  };

  if (panelName === 'trending') {
    return { ...base, trendSignal: item.trendSignal || '' };
  }
  if (panelName === 'gaps') {
    return { ...base, gapReason: item.gapReason || '', lastCoveredYear: typeof item.lastCoveredYear === 'number' ? item.lastCoveredYear : null };
  }
  if (panelName === 'competitors') {
    return { ...base, channel: item.channel || '', performanceReason: item.performanceReason || '', suggestedAngle: item.suggestedAngle || '' };
  }
  return base;
}

async function runDiscoveryPanel(panelName, prompt, catalog) {
  const client = new Anthropic();
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  let jsonText = '';
  for (const block of message.content) {
    if (block.type === 'text') jsonText += block.text;
  }

  const parsed = parseClaudeJson(jsonText);
  const items = Array.isArray(parsed) ? parsed : (parsed[panelName] || parsed.items || []);

  const cleaned = items.map(item => sanitizeItem(item, panelName));

  return filterCovered(cleaned, catalog);
}

// POST /api/research/discover
// Optional query param ?panel=trending|gaps|competitors to re-run a single panel
router.post('/discover', async (req, res) => {
  const { profile } = req.body;
  const err = validateProfile(profile);
  if (err) return res.status(400).json({ error: err });

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const singlePanel = req.query.panel;
  const validPanels = ['trending', 'gaps', 'competitors'];

  if (singlePanel && !validPanels.includes(singlePanel)) {
    return res.status(400).json({ error: `Invalid panel: ${singlePanel}. Must be one of: ${validPanels.join(', ')}` });
  }

  try {
    if (singlePanel) {
      const promptFn = { trending: buildTrendingPrompt, gaps: buildGapsPrompt, competitors: buildCompetitorsPrompt }[singlePanel];
      const items = await runDiscoveryPanel(singlePanel, promptFn(profile), profile.catalog);
      return res.json({ [singlePanel]: items });
    }

    const results = await Promise.allSettled([
      runDiscoveryPanel('trending', buildTrendingPrompt(profile), profile.catalog),
      runDiscoveryPanel('gaps', buildGapsPrompt(profile), profile.catalog),
      runDiscoveryPanel('competitors', buildCompetitorsPrompt(profile), profile.catalog),
    ]);

    const report = {
      reportId: `report_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      profileId: profile.profileId || null,
      trending: results[0].status === 'fulfilled' ? results[0].value : [],
      gaps: results[1].status === 'fulfilled' ? results[1].value : [],
      competitors: results[2].status === 'fulfilled' ? results[2].value : [],
    };

    if (results[0].status === 'rejected') console.error('[discover/trending]', results[0].reason?.message);
    if (results[1].status === 'rejected') console.error('[discover/gaps]', results[1].reason?.message);
    if (results[2].status === 'rejected') console.error('[discover/competitors]', results[2].reason?.message);

    res.json(report);
  } catch (err) {
    console.error('[discover] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/research/discover/stream
router.post('/discover/stream', async (req, res) => {
  const { profile } = req.body;
  const err = validateProfile(profile);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  discoveryRunning = true;
  let clientDisconnected = false;
  req.on('close', () => { clientDisconnected = true; discoveryRunning = false; });

  const reportId = `report_${Date.now()}`;
  const generatedAt = new Date().toISOString();

  function send(data) {
    if (!clientDisconnected && !res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }

  const panels = [
    { name: 'trending', prompt: buildTrendingPrompt(profile) },
    { name: 'gaps', prompt: buildGapsPrompt(profile) },
    { name: 'competitors', prompt: buildCompetitorsPrompt(profile) },
  ];

  const promises = panels.map(async ({ name, prompt }) => {
    try {
      const items = await runDiscoveryPanel(name, prompt, profile.catalog);
      send({ type: 'panel', panel: name, items });
      return { name, items };
    } catch (error) {
      console.error(`[discover/stream/${name}]`, error.message);
      send({ type: 'error', panel: name, message: error.message });
      return { name, items: [], error: error.message };
    }
  });

  await Promise.allSettled(promises);

  send({ type: 'done', reportId, generatedAt });
  discoveryRunning = false;
  if (!res.writableEnded) res.end();
});

// GET /api/research/discover/status
router.get('/discover/status', (req, res) => {
  res.json({ running: discoveryRunning });
});

module.exports = router;
