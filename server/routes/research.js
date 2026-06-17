const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');

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
    if (err.message.includes('not found') || err.message.includes('404')) {
      return res.status(404).json({ error: 'Channel not found. Check the URL and try again.' });
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

module.exports = router;
