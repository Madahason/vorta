const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getCached(handle) {
  const entry = cache.get(handle.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) { cache.delete(handle.toLowerCase()); return null; }
  return entry.data;
}
function setCache(handle, data) { cache.set(handle.toLowerCase(), { data, fetchedAt: Date.now() }); }

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

async function ytFetch(endpoint, params) {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  params.key = process.env.YOUTUBE_API_KEY;
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  });
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`YouTube API error ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

async function resolveChannelId(handle) {
  const clean = handle.replace(/^@/, '');
  const data = await ytFetch('search', { part: 'snippet', q: `@${clean}`, type: 'channel', maxResults: 1 });
  return data.items?.[0]?.snippet?.channelId || null;
}

async function getCompetitorVideos(channelHandle, options = {}) {
  if (!process.env.YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY not configured');

  const cached = getCached(channelHandle);
  if (cached) { console.log(`[competitor] cache hit: ${channelHandle}`); return cached; }

  const { recentCount = 10, topCount = 5 } = options;
  const channelId = await resolveChannelId(channelHandle);
  if (!channelId) throw new Error(`Channel not found: ${channelHandle}`);

  const channelData = await ytFetch('channels', { part: 'snippet,statistics', id: channelId });
  const ch = channelData.items?.[0];
  if (!ch) throw new Error(`Channel data not found: ${channelHandle}`);

  const channelName = ch.snippet.title;
  const subscriberCount = parseInt(ch.statistics.subscriberCount || '0');

  const [recentSearch, topSearch] = await Promise.all([
    ytFetch('search', { part: 'snippet', channelId, maxResults: recentCount, order: 'date', type: 'video' }),
    ytFetch('search', { part: 'snippet', channelId, maxResults: topCount, order: 'viewCount', type: 'video' }),
  ]);

  const allIds = new Set();
  const recentIds = (recentSearch.items || []).map(i => i.id?.videoId).filter(Boolean);
  const topIds = (topSearch.items || []).map(i => i.id?.videoId).filter(Boolean);
  recentIds.forEach(id => allIds.add(id));
  topIds.forEach(id => allIds.add(id));

  let videoMap = {};
  if (allIds.size > 0) {
    const statsData = await ytFetch('videos', { part: 'statistics,snippet,contentDetails', id: [...allIds].join(',') });
    for (const v of (statsData.items || [])) {
      videoMap[v.id] = {
        title: v.snippet.title,
        views: parseInt(v.statistics.viewCount || '0'),
        publishedAt: v.snippet.publishedAt,
        duration: v.contentDetails?.duration || '',
        tags: (v.snippet.tags || []).slice(0, 10)
      };
    }
  }

  const recentVideos = recentIds.map(id => videoMap[id]).filter(Boolean);
  const topVideos = topIds.map(id => videoMap[id]).filter(Boolean).sort((a, b) => b.views - a.views);
  const avgViewsRecent = recentVideos.length ? Math.round(recentVideos.reduce((s, v) => s + v.views, 0) / recentVideos.length) : 0;

  const result = {
    channelHandle,
    channelName,
    subscriberCount,
    recentVideos,
    topVideos,
    avgViewsRecent,
    dataSource: 'youtube-api',
    fetchedAt: new Date().toISOString()
  };

  setCache(channelHandle, result);
  return result;
}

async function getAllCompetitorData(competitorHandles) {
  if (!competitorHandles || competitorHandles.length === 0) return [];
  const results = await Promise.allSettled(
    competitorHandles.map(h => getCompetitorVideos(h))
  );
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[competitor] failed for ${competitorHandles[i]}: ${r.reason?.message}`);
    return { channelHandle: competitorHandles[i], error: r.reason?.message || 'Failed', dataSource: 'youtube-api', fetchedAt: new Date().toISOString() };
  });
}

module.exports = { getCompetitorVideos, getAllCompetitorData };
