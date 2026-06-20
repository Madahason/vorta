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

function repairJson(raw) {
  let s = raw.trim();
  s = s.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  s = s.replace(/,\s*([\]}])/g, '$1');

  // Walk the string tracking depth outside of string literals
  // to find the last position where the structure was valid
  let inString = false;
  let escaped = false;
  const stack = [];
  let lastSafe = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
    if (ch === ',' || ch === '}' || ch === ']') lastSafe = i + 1;
  }

  if (stack.length === 0) return s;

  // Truncate to last safe boundary and close remaining brackets
  s = s.slice(0, lastSafe);
  // Remove any trailing comma
  s = s.replace(/,\s*$/, '');
  // Re-scan to find what's still open
  const stack2 = [];
  inString = false; escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack2.push('}');
    else if (ch === '[') stack2.push(']');
    else if (ch === '}' || ch === ']') stack2.pop();
  }
  s += stack2.reverse().join('');
  return s;
}

function parseClaudeJson(text) {
  const trimmed = text.trim();
  // Try raw first
  try { return JSON.parse(trimmed); } catch {}
  // Extract the outermost JSON object or array
  const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
    // Attempt repair (trailing commas, truncated structures)
    try { return JSON.parse(repairJson(match[0])); } catch (e) {
      const pos = parseInt((e.message.match(/position (\d+)/) || [])[1]) || 0;
      console.error(`[parseClaudeJson] repair failed at pos ${pos}: ...${match[0].slice(Math.max(0, pos - 80), pos + 80)}...`);
    }
  }
  throw new Error('Claude returned invalid JSON');
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

const trendsService = require('../services/trendsService');
const competitionService = require('../services/competitionService');
const competitorService = require('../services/competitorService');

async function runDiscoveryPanel(panelName, prompt, catalog) {
  const client = new Anthropic();
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlocks = message.content.filter(b => b.type === 'text').map(b => b.text);
  const jsonText = textBlocks.length > 0 ? textBlocks[textBlocks.length - 1] : '';

  const parsed = parseClaudeJson(jsonText);
  const items = Array.isArray(parsed) ? parsed : (parsed[panelName] || parsed.items || []);

  const cleaned = items.map(item => sanitizeItem(item, panelName));

  return filterCovered(cleaned, catalog);
}

async function runEnrichedDiscovery(panelName, profile) {
  const startTime = Date.now();
  const client = new Anthropic();
  const catalog = profile.catalog || [];

  // Step 1: Get Claude to suggest candidate topics
  const candidatePrompt = panelName === 'competitors'
    ? buildCompetitorsPrompt(profile)
    : panelName === 'gaps'
      ? buildGapsPrompt(profile)
      : buildTrendingPrompt(profile);

  const candidateMsg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: candidatePrompt }],
  });

  const candidateBlocks = candidateMsg.content.filter(b => b.type === 'text').map(b => b.text);
  const candidateText = candidateBlocks.length > 0 ? candidateBlocks[candidateBlocks.length - 1] : '';
  const candidateItems = (() => {
    try {
      const p = parseClaudeJson(candidateText);
      return Array.isArray(p) ? p : (p[panelName] || p.items || []);
    } catch { return []; }
  })();

  const topicTitles = candidateItems.map(i => i.title).filter(Boolean).slice(0, 8);

  // Step 2: Enrich with real data
  let trendResults = [];
  let competitionResults = [];
  let competitorData = [];
  const dataSources = { panel: panelName };
  const fallbacks = [];

  try {
    if (panelName === 'trending' || panelName === 'gaps') {
      const [trends, comps] = await Promise.allSettled([
        trendsService.getTrendDataBatch(topicTitles, profile.niche),
        Promise.all(topicTitles.map(t => competitionService.getCompetitionData(t).catch(() => null)))
      ]);
      trendResults = trends.status === 'fulfilled' ? trends.value : [];
      competitionResults = comps.status === 'fulfilled' ? comps.value : [];
      trendResults.forEach(t => { if (t.dataSource === 'claude-estimate') fallbacks.push(t.topic); });
      dataSources.trends = trendResults[0]?.dataSource || 'unavailable';
      dataSources.competition = 'youtube-search-api';
    }
    if (panelName === 'competitors' && profile.competitors?.length > 0) {
      competitorData = await competitorService.getAllCompetitorData(profile.competitors);
      dataSources.competitors = 'youtube-api';
    }
  } catch (err) {
    console.warn(`[discover/enrich/${panelName}]`, err.message);
  }

  // Build trend/competition lookup maps
  const trendMap = {};
  trendResults.forEach(t => { trendMap[t.topic?.toLowerCase()] = t; });
  const compMap = {};
  competitionResults.forEach(c => { if (c) compMap[c.topic?.toLowerCase()] = c; });

  // Step 3: Claude synthesis with real data
  const enrichedDataBlock = panelName === 'competitors'
    ? `\nREAL COMPETITOR DATA:\n${competitorData.filter(c => !c.error).map(c =>
        `Channel: ${c.channelName} (@${c.channelHandle}) — ${c.subscriberCount?.toLocaleString()} subs, avg ${c.avgViewsRecent?.toLocaleString()} views/recent\nTop videos:\n${(c.topVideos || []).slice(0, 3).map(v => `  - "${v.title}" (${v.views?.toLocaleString()} views, ${v.publishedAt?.slice(0, 10)})`).join('\n')}\nRecent videos:\n${(c.recentVideos || []).slice(0, 5).map(v => `  - "${v.title}" (${v.views?.toLocaleString()} views, ${v.publishedAt?.slice(0, 10)})`).join('\n')}`
      ).join('\n\n')}`
    : `\nREAL TREND & COMPETITION DATA:\n${topicTitles.map(t => {
        const td = trendMap[t.toLowerCase()];
        const cd = compMap[t.toLowerCase()];
        return `Topic: "${t}"\n  Trends: interestScore=${td?.interestScore ?? '?'}, trend=${td?.trend ?? '?'}, peak=${td?.peakScore ?? '?'}, source=${td?.dataSource ?? 'none'}\n  Competition: ${cd ? `${cd.totalResults} videos, median ${cd.medianViews} views, ${cd.competitionLevel} competition${cd.weakCoverageSignals?.length ? ', signals: ' + cd.weakCoverageSignals.join('; ') : ''}` : 'unavailable'}`;
      }).join('\n')}`;

  const scoreRubric = `
OPPORTUNITY SCORE RUBRIC (calculate for each topic):
Trend momentum (0-3 pts): rising + score>60 = 3, stable + score>40 = 2, else 1
Competition gap (0-4 pts): low + 2+ weak signals = 4, low = 3, medium = 2, high = 1
Channel fit (0-3 pts): how well it matches angle "${profile.angle}" and tone "${profile.tone}"
Total: sum of all three (integer 1-10)`;

  const synthesisPrompt = panelName === 'competitors'
    ? `Based on the REAL YouTube data below, identify 4-6 videos from competitor channels that are overperforming relative to the channel's average.${enrichedDataBlock}\n\nOur channel: niche="${profile.niche}", angle="${profile.angle}", tone="${profile.tone}"\n${scoreRubric}\n\nFor each return: title, channel, summary, performanceReason, opportunityScore, suggestedAngle, alreadyCovered, subscriberCount (real number), realViews (real number).\nReturn ONLY valid JSON array.`
    : panelName === 'gaps'
      ? `Based on the REAL trend and competition data below, identify 6-8 topics with genuine search demand but weak YouTube coverage.${enrichedDataBlock}\n\nChannel: niche="${profile.niche}", angle="${profile.angle}", tone="${profile.tone}"\n${scoreRubric}\n\nFor each return: title, summary, gapReason, opportunityScore, estimatedSearchVolume, lastCoveredYear, alreadyCovered, trendData (object with interestScore, trend, dataSource), competitionData (object with totalResults, medianViews, competitionLevel, weakCoverageSignals).\nReturn ONLY valid JSON array.`
      : `Based on the REAL trend and competition data below, identify 6-8 trending topics gaining momentum.${enrichedDataBlock}\n\nChannel: niche="${profile.niche}", angle="${profile.angle}", tone="${profile.tone}"\n${scoreRubric}\n\nFor each return: title, summary, trendSignal, opportunityScore, estimatedSearchVolume, alreadyCovered, trendData (object with interestScore, trend, peakScore, timelinePoints, dataSource), competitionData (object with totalResults, medianViews, competitionLevel, weakCoverageSignals).\nReturn ONLY valid JSON array.`;

  const synthMsg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: synthesisPrompt }],
  });

  let synthText = '';
  for (const block of synthMsg.content) {
    if (block.type === 'text') synthText += block.text;
  }

  const synthParsed = (() => {
    try {
      const p = parseClaudeJson(synthText);
      return Array.isArray(p) ? p : (p[panelName] || p.items || []);
    } catch { return candidateItems; }
  })();

  const enrichedItems = synthParsed.map(item => ({
    ...sanitizeItem(item, panelName),
    trendData: item.trendData || trendMap[item.title?.toLowerCase()] || null,
    competitionData: item.competitionData || compMap[item.title?.toLowerCase()] || null,
    subscriberCount: item.subscriberCount || null,
    realViews: item.realViews || null,
  }));

  const elapsed = Date.now() - startTime;
  console.log(`[discover/${panelName}] enriched in ${elapsed}ms (${enrichedItems.length} items)`);

  return { items: filterCovered(enrichedItems, catalog), dataSources, fallbacks };
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
      const result = await runEnrichedDiscovery(singlePanel, profile);
      return res.json({ [singlePanel]: result.items });
    }

    const results = await Promise.allSettled([
      runEnrichedDiscovery('trending', profile),
      runEnrichedDiscovery('gaps', profile),
      runEnrichedDiscovery('competitors', profile),
    ]);

    const allFallbacks = [];
    const dsInfo = {};
    const panelErrors = {};
    const extract = (r, name) => {
      if (r.status === 'fulfilled') {
        dsInfo[name] = r.value.dataSources;
        allFallbacks.push(...(r.value.fallbacks || []));
        return r.value.items;
      }
      const msg = r.reason?.message || 'Unknown error';
      console.error(`[discover/${name}]`, msg);
      panelErrors[name] = msg;
      return [];
    };

    const report = {
      reportId: `report_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      profileId: profile.profileId || null,
      trending: extract(results[0], 'trending'),
      gaps: extract(results[1], 'gaps'),
      competitors: extract(results[2], 'competitors'),
      dataSources: { ...dsInfo, trendFallbacks: allFallbacks },
      errors: Object.keys(panelErrors).length > 0 ? panelErrors : undefined,
    };

    if (Object.keys(panelErrors).length === 3) {
      const firstErr = Object.values(panelErrors)[0];
      if (firstErr.includes('credit balance') || firstErr.includes('authentication')) {
        return res.status(402).json({ error: firstErr, report });
      }
    }

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
  res.flushHeaders();

  discoveryRunning = true;
  let clientDisconnected = false;
  res.on('close', () => {
    clientDisconnected = true;
    discoveryRunning = false;
  });

  const reportId = `report_${Date.now()}`;
  const generatedAt = new Date().toISOString();

  function send(data) {
    if (!clientDisconnected && !res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }

  const panelNames = ['trending', 'gaps', 'competitors'];
  const allFallbacks = [];
  const dsInfo = {};

  const promises = panelNames.map(async (name) => {
    try {
      const result = await runEnrichedDiscovery(name, profile);
      dsInfo[name] = result.dataSources;
      allFallbacks.push(...(result.fallbacks || []));
      send({ type: 'panel', panel: name, items: result.items });
      return { name, items: result.items };
    } catch (error) {
      console.error(`[discover/stream/${name}]`, error.message);
      send({ type: 'error', panel: name, message: error.message });
      return { name, items: [], error: error.message };
    }
  });

  await Promise.allSettled(promises);

  send({ type: 'done', reportId, generatedAt, dataSources: { ...dsInfo, trendFallbacks: allFallbacks } });
  discoveryRunning = false;
  if (!res.writableEnded) res.end();
});

// GET /api/research/discover/status
router.get('/discover/status', (req, res) => {
  res.json({ running: discoveryRunning });
});

// --- VR-3: Idea Card endpoints ---

function sanitizeAngle(angle, idx) {
  return {
    angleId: angle.angleId || `angle_${idx + 1}`,
    title: angle.title || 'Untitled angle',
    pitch: angle.pitch || '',
    approach: angle.approach || '',
    fitScore: clampScore(angle.fitScore),
    fitReason: angle.fitReason || '',
    competitorGap: angle.competitorGap || '',
    estimatedDuration: angle.estimatedDuration || '10-15 min',
    difficulty: ['low', 'medium', 'high'].includes(angle.difficulty) ? angle.difficulty : 'medium',
    hook: angle.hook || '',
  };
}

// POST /api/research/angles
router.post('/angles', async (req, res) => {
  const { opportunity, profile } = req.body;

  if (!opportunity || typeof opportunity !== 'object' || !opportunity.title?.trim()) {
    return res.status(400).json({ error: 'opportunity is required and must have a title' });
  }
  const profileErr = validateProfile(profile);
  if (profileErr) return res.status(400).json({ error: profileErr });

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Generate exactly 4 differentiated video angles for this YouTube topic, plus topic depth research and competitor analysis.

TOPIC: ${opportunity.title}
Topic summary: ${opportunity.summary || ''}
${opportunity.trendSignal ? `Trend signal: ${opportunity.trendSignal}` : ''}
${opportunity.gapReason ? `Gap reason: ${opportunity.gapReason}` : ''}
${opportunity.suggestedAngle ? `Suggested angle: ${opportunity.suggestedAngle}` : ''}

CHANNEL PROFILE:
Niche: ${profile.niche}
Sub-focus: ${profile.subFocus}
Angle: ${profile.angle}
Tone: ${profile.tone}
Competitors: ${(profile.competitors || []).join(', ') || 'none specified'}

RULES:
- Generate EXACTLY 4 angles — not 3, not 5
- Angles must be genuinely differentiated — different narrative structure, different protagonist, different conclusion
- recommendedAngleId must be the angle that best matches the channel's angle and tone
- fitScore is integer 1-10, weighted toward channel alignment
- topicDepth.keyFacts must be specific and verifiable — no vague generalities
- competitorCoverage should reflect real videos if web search finds them
- Use web search to find real competitor videos and current information about the topic

JSON SAFETY — follow these exactly:
- Return ONLY valid JSON. No markdown code fences. No preamble or explanation before or after the JSON.
- Any double quotes within string values MUST be escaped as \\" — this includes quoted speech in hooks, titles with quotes, and any attribution.
- Do not use unescaped newlines within string values — use \\n if a line break is needed.
- No trailing commas before closing brackets.
{
  "topic": "${opportunity.title}",
  "angles": [
    {
      "angleId": "angle_1",
      "title": "short angle label (4-6 words)",
      "pitch": "one sentence — what makes this angle compelling",
      "approach": "2-3 sentences — how to execute this angle",
      "fitScore": 8,
      "fitReason": "why this fits the channel's POV and tone",
      "competitorGap": "what competitors missed",
      "estimatedDuration": "10-14 min",
      "difficulty": "low | medium | high",
      "hook": "one punchy opening line"
    }
  ],
  "recommendedAngleId": "angle_X",
  "competitorCoverage": [
    {
      "channel": "channel name",
      "title": "their video title",
      "angle": "what angle they took",
      "weakness": "where their coverage falls short"
    }
  ],
  "competitorInsight": "2-3 sentence synthesis of what the competitor landscape means for your opportunity",
  "topicDepth": {
    "summary": "3-4 sentence overview",
    "keyFacts": ["5-7 specific verifiable facts"],
    "timeline": ["key moments in chronological order if applicable"],
    "mainCharacters": ["key people or companies involved"]
  }
}`
      }],
    });

    const textBlocks = message.content.filter(b => b.type === 'text').map(b => b.text);
    // Use the last text block — earlier blocks are thinking/preamble from web_search
    const jsonText = textBlocks.length > 0 ? textBlocks[textBlocks.length - 1] : '';

    if (message.stop_reason === 'max_tokens') {
      console.warn('[angles] response truncated by max_tokens — attempting repair');
    }

    const parsed = parseClaudeJson(jsonText);

    // Sanitize angles
    let angles = Array.isArray(parsed.angles) ? parsed.angles : [];
    angles = angles.map((a, i) => sanitizeAngle(a, i));

    // Enforce exactly 4 angles
    if (angles.length > 4) angles = angles.slice(0, 4);
    while (angles.length < 4) {
      angles.push(sanitizeAngle({ title: `Alternative angle ${angles.length + 1}` }, angles.length));
    }

    // Validate recommendedAngleId
    const angleIds = angles.map(a => a.angleId);
    let recommendedAngleId = parsed.recommendedAngleId;
    if (!angleIds.includes(recommendedAngleId)) {
      recommendedAngleId = angles.reduce((best, a) => a.fitScore > best.fitScore ? a : best, angles[0]).angleId;
    }

    // Sanitize topicDepth
    const td = parsed.topicDepth || {};
    let keyFacts = Array.isArray(td.keyFacts) ? td.keyFacts.filter(f => typeof f === 'string' && f.trim()) : [];
    if (keyFacts.length > 7) keyFacts = keyFacts.slice(0, 7);
    while (keyFacts.length < 5) keyFacts.push('Additional research needed');

    const topicDepth = {
      summary: td.summary || '',
      keyFacts,
      timeline: Array.isArray(td.timeline) ? td.timeline.filter(t => typeof t === 'string' && t.trim()) : [],
      mainCharacters: Array.isArray(td.mainCharacters) ? td.mainCharacters.filter(c => typeof c === 'string' && c.trim()) : [],
    };

    // Sanitize competitorCoverage
    const competitorCoverage = Array.isArray(parsed.competitorCoverage)
      ? parsed.competitorCoverage.map(c => ({
          channel: c.channel || '',
          title: c.title || '',
          angle: c.angle || '',
          weakness: c.weakness || '',
        }))
      : [];

    res.json({
      topic: parsed.topic || opportunity.title,
      angles,
      recommendedAngleId,
      competitorCoverage,
      competitorInsight: typeof parsed.competitorInsight === 'string' && parsed.competitorInsight.trim()
        ? parsed.competitorInsight
        : 'No direct competitor analysis available for this topic.',
      topicDepth,
    });
  } catch (err) {
    console.error('[research/angles] error:', err.message);
    const isParseError = err.message.includes('JSON') || err.message.includes('position');
    res.status(500).json({
      error: isParseError
        ? 'Failed to parse angle data — please try again'
        : err.message
    });
  }
});

// POST /api/research/idea/save
router.post('/idea/save', async (req, res) => {
  const { opportunity, selectedAngle, profile } = req.body;

  if (!opportunity || !opportunity.title?.trim()) {
    return res.status(400).json({ error: 'opportunity with title is required' });
  }
  if (!selectedAngle || !selectedAngle.angleId?.trim()) {
    return res.status(400).json({ error: 'selectedAngle with angleId is required' });
  }
  if (!profile || !profile.profileId) {
    return res.status(400).json({ error: 'profile with profileId is required' });
  }

  res.json({
    ideaId: `idea_${Date.now()}`,
    savedAt: new Date().toISOString(),
    topic: opportunity.title,
    opportunityScore: opportunity.opportunityScore || 0,
    selectedAngle,
    profileId: profile.profileId,
    status: 'saved',
  });
});

// POST /api/research/competitors/filtered
router.post('/competitors/filtered', async (req, res) => {
  const { profile, filters } = req.body;

  if (!profile?.competitors || !Array.isArray(profile.competitors) || profile.competitors.length === 0) {
    return res.status(400).json({ error: 'profile.competitors must be a non-empty array' });
  }

  if (!process.env.YOUTUBE_API_KEY) {
    return res.status(500).json({ error: 'YOUTUBE_API_KEY not configured' });
  }

  try {
    const videos = await competitorService.getFilteredCompetitorVideos(
      profile.competitors,
      filters || {}
    );
    res.json({ videos, appliedFilters: filters || {}, resultCount: videos.length });
  } catch (err) {
    console.error('[research/competitors/filtered] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
