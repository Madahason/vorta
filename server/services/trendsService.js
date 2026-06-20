const Anthropic = require('@anthropic-ai/sdk');

const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getCached(topic) {
  const entry = cache.get(topic.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(topic.toLowerCase());
    return null;
  }
  return entry.data;
}

function setCache(topic, data) {
  cache.set(topic.toLowerCase(), { data, fetchedAt: Date.now() });
}

function parseSerpApiResponse(data, topic) {
  const timeline = data.interest_over_time?.timeline_data || [];
  const values = timeline.map(p => p.values?.[0]?.extracted_value || 0);
  const current = values[values.length - 1] || 0;
  const peak = Math.max(...values, 0);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  return {
    topic,
    interestScore: current,
    trend: current > avg * 1.2 ? 'rising' : current < avg * 0.8 ? 'falling' : 'stable',
    peakScore: peak,
    timelinePoints: timeline.map(p => ({
      date: p.date,
      value: p.values?.[0]?.extracted_value || 0
    })),
    relatedTopics: (data.related_topics?.rising || []).slice(0, 5).map(t => t.topic?.title || '').filter(Boolean),
    dataSource: 'serpapi',
    fetchedAt: new Date().toISOString()
  };
}

async function fetchFromSerpApi(topic) {
  if (!process.env.SERPAPI_KEY) throw new Error('SERPAPI_KEY not set');

  const SerpApi = require('google-search-results-nodejs');
  const client = new SerpApi.GoogleSearch(process.env.SERPAPI_KEY);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SerpApi timeout after 15s')), 15000);
    client.json({
      engine: 'google_trends',
      q: topic,
      date: 'today 3-m',
      data_type: 'TIMESERIES'
    }, (data) => {
      clearTimeout(timer);
      if (data.error) reject(new Error(data.error));
      else resolve(parseSerpApiResponse(data, topic));
    });
  });
}

function parseGoogleTrendsResponse(data, topic) {
  const timeline = data.default?.timelineData || [];
  const values = timeline.map(p => p.value?.[0] || 0);
  const current = values[values.length - 1] || 0;
  const peak = Math.max(...values, 0);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  return {
    topic,
    interestScore: current,
    trend: current > avg * 1.2 ? 'rising' : current < avg * 0.8 ? 'falling' : 'stable',
    peakScore: peak,
    timelinePoints: timeline.map(p => ({
      date: new Date(p.time * 1000).toISOString().split('T')[0],
      value: p.value?.[0] || 0
    })),
    relatedTopics: [],
    dataSource: 'google-trends-api',
    fetchedAt: new Date().toISOString()
  };
}

async function fetchFromGoogleTrends(topic) {
  const googleTrends = require('google-trends-api');
  const endTime = new Date();
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - 90);

  const result = await Promise.race([
    googleTrends.interestOverTime({ keyword: topic, startTime, endTime }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Google Trends timeout after 15s')), 15000))
  ]);
  return parseGoogleTrendsResponse(JSON.parse(result), topic);
}

async function fetchFromClaude(topic, niche) {
  const client = new Anthropic();
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Estimate the current Google Trends interest score (0-100) for the topic "${topic}" in the context of "${niche}" YouTube content. Return only JSON: {"interestScore": number, "trend": "rising"|"stable"|"falling", "peakScore": number, "reasoning": "string"}`
    }]
  });

  const text = message.content[0].text.trim();
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { interestScore: 50, trend: 'stable', peakScore: 60 };
  }

  return {
    topic,
    interestScore: Math.max(0, Math.min(100, parseInt(parsed.interestScore) || 50)),
    trend: ['rising', 'stable', 'falling'].includes(parsed.trend) ? parsed.trend : 'stable',
    peakScore: Math.max(0, Math.min(100, parseInt(parsed.peakScore) || 60)),
    timelinePoints: [],
    relatedTopics: [],
    dataSource: 'claude-estimate',
    fetchedAt: new Date().toISOString()
  };
}

async function getTrendData(topic, niche) {
  const cached = getCached(topic);
  if (cached) {
    console.log(`[trends] cache hit: ${topic}`);
    return cached;
  }

  let result;

  try {
    result = await fetchFromSerpApi(topic);
    console.log(`[trends] serpapi: ${topic} → ${result.interestScore}`);
  } catch (err) {
    console.warn(`[trends] serpapi failed for "${topic}": ${err.message}`);
    try {
      await sleep(1000);
      result = await fetchFromGoogleTrends(topic);
      console.log(`[trends] google-trends-api: ${topic} → ${result.interestScore}`);
    } catch (err2) {
      console.warn(`[trends] google-trends-api failed for "${topic}": ${err2.message}`);
      console.warn(`[trends] falling back to claude estimate for "${topic}"`);
      result = await fetchFromClaude(topic, niche);
    }
  }

  setCache(topic, result);
  return result;
}

async function getTrendDataBatch(topics, niche) {
  const results = [];
  for (const topic of topics.slice(0, 8)) {
    const start = Date.now();
    results.push(await getTrendData(topic, niche));
    const elapsed = Date.now() - start;
    if (elapsed < 500) await sleep(500 - elapsed);
  }
  return results;
}

module.exports = { getTrendData, getTrendDataBatch };
