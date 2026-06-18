const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getCached(topic) {
  const entry = cache.get(topic.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) { cache.delete(topic.toLowerCase()); return null; }
  return entry.data;
}
function setCache(topic, data) { cache.set(topic.toLowerCase(), { data, fetchedAt: Date.now() }); }

function buildEmptyCompetitionResult(topic, totalResults) {
  return {
    topic,
    totalResults: totalResults || 0,
    analyzedCount: 0,
    medianViews: 0,
    avgViews: 0,
    topVideo: null,
    weakCoverageSignals: ['No videos found for this topic'],
    competitionLevel: 'low',
    dataSource: 'youtube-search-api',
    fetchedAt: new Date().toISOString()
  };
}

function analyzeCompetition(topic, videos, totalResults) {
  const views = videos.map(v => v.views).sort((a, b) => a - b);
  const median = views[Math.floor(views.length / 2)] || 0;
  const avg = views.reduce((a, b) => a + b, 0) / (views.length || 1);
  const sorted = [...videos].sort((a, b) => b.views - a.views);
  const topVideo = sorted[0] || null;

  const signals = [];
  if (videos.length > 0) {
    const mostRecent = new Date(Math.max(...videos.map(v => new Date(v.publishedAt).getTime())));
    const monthsOld = (Date.now() - mostRecent.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsOld > 24) signals.push(`Most recent video is ${Math.round(monthsOld / 12)} years old`);
    if (median < 10000) signals.push('Median view count under 10k — low audience engagement');
    if (topVideo && topVideo.views < 100000) signals.push('No video exceeds 100k views — unclaimed topic');
  }
  if (totalResults < 50) signals.push('Fewer than 50 videos exist on this topic');

  const competitionLevel = median > 100000 ? 'high' : median > 20000 ? 'medium' : 'low';

  return {
    topic,
    totalResults,
    analyzedCount: videos.length,
    medianViews: median,
    avgViews: Math.round(avg),
    topVideo,
    weakCoverageSignals: signals,
    competitionLevel,
    dataSource: 'youtube-search-api',
    fetchedAt: new Date().toISOString()
  };
}

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

async function getCompetitionData(topic, maxResults = 20) {
  if (!process.env.YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY not configured');

  const cached = getCached(topic);
  if (cached) { console.log(`[competition] cache hit: ${topic}`); return cached; }

  const searchData = await ytFetch('search', {
    part: 'snippet',
    q: topic,
    type: 'video',
    maxResults,
    order: 'relevance',
    relevanceLanguage: 'en'
  });

  const videoIds = (searchData.items || []).map(i => i.id?.videoId).filter(Boolean);
  const totalResults = searchData.pageInfo?.totalResults || 0;

  if (videoIds.length === 0) {
    const result = buildEmptyCompetitionResult(topic, totalResults);
    setCache(topic, result);
    return result;
  }

  const statsData = await ytFetch('videos', {
    part: 'statistics,snippet',
    id: videoIds.join(',')
  });

  const videos = (statsData.items || []).map(v => ({
    title: v.snippet.title,
    views: parseInt(v.statistics.viewCount || '0'),
    publishedAt: v.snippet.publishedAt,
    channelName: v.snippet.channelTitle
  }));

  const result = analyzeCompetition(topic, videos, totalResults);
  setCache(topic, result);
  return result;
}

module.exports = { getCompetitionData };
