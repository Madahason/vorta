const { callClaude } = require('./claude');

const KNOWN_CHANNELS = {
  // Tech companies
  'apple':       { channel: 'Apple',       url: 'https://www.youtube.com/@Apple' },
  'google':      { channel: 'Google',      url: 'https://www.youtube.com/@Google' },
  'microsoft':   { channel: 'Microsoft',   url: 'https://www.youtube.com/@Microsoft' },
  'tesla':       { channel: 'Tesla',       url: 'https://www.youtube.com/@Tesla' },
  'openai':      { channel: 'OpenAI',      url: 'https://www.youtube.com/@OpenAI' },
  'meta':        { channel: 'Meta',        url: 'https://www.youtube.com/@Meta' },
  'amazon':      { channel: 'Amazon',      url: 'https://www.youtube.com/@Amazon' },
  'netflix':     { channel: 'Netflix',     url: 'https://www.youtube.com/@Netflix' },
  'spacex':      { channel: 'SpaceX',      url: 'https://www.youtube.com/@SpaceX' },
  'nvidia':      { channel: 'NVIDIA',      url: 'https://www.youtube.com/@NVIDIA' },

  // People — reliable interview/talk channels
  'sam altman':        { channel: 'Y Combinator',      query: 'Sam Altman' },
  'elon musk':         { channel: 'TED',               query: 'Elon Musk' },
  'tim cook':          { channel: 'Apple',              query: 'Tim Cook keynote' },
  'jeff bezos':        { channel: 'Bloomberg Technology', query: 'Jeff Bezos interview' },
  'bill gates':        { channel: 'Bill Gates',         url: 'https://www.youtube.com/@billgates' },
  'mark zuckerberg':   { channel: 'Meta',               query: 'Mark Zuckerberg' },
  'sundar pichai':     { channel: 'Google',             query: 'Sundar Pichai' },
  'jensen huang':      { channel: 'NVIDIA',             query: 'Jensen Huang keynote' },

  // News/government
  'congress':    { channel: 'C-SPAN',         url: 'https://www.youtube.com/@cspan' },
  'senate':      { channel: 'C-SPAN',         url: 'https://www.youtube.com/@cspan' },
  'white house': { channel: 'The White House', url: 'https://www.youtube.com/@WhiteHouse' },
  'ted talk':    { channel: 'TED',             url: 'https://www.youtube.com/@TED' },
};

async function buildClipStrategy(scene) {
  const anchors = (scene.subject_anchors || []).map(a => a.toLowerCase());
  const excerpt = scene.script_excerpt || '';
  const mood    = scene.mood || 'neutral';

  // Check if we have a known channel for any subject anchor
  const knownSources = [];
  for (const anchor of anchors) {
    for (const [key, channel] of Object.entries(KNOWN_CHANNELS)) {
      if (anchor.includes(key) || key.includes(anchor)) {
        knownSources.push(channel);
        break;
      }
    }
  }

  const prompt = `You are a documentary researcher finding real video footage.

Scene to find footage for:
Script excerpt: "${excerpt}"
Subject anchors: ${JSON.stringify(scene.subject_anchors || [])}
Mood: ${mood}

Known reliable channels found: ${JSON.stringify(knownSources)}

Your task: Return a JSON search strategy to find the EXACT subject in this scene.

Rules:
1. Primary sources should be official channels or known interview programs
2. Search queries must be specific enough to find the actual subject — not commentary or reactions
3. Avoid terms list must filter out reaction videos, compilations, and unrelated content
4. Provide a timestamp hint — where in a typical video of this type would the subject appear
   e.g. "conference keynote: subject usually appears at 2-5 minutes after intro"
   e.g. "interview: subject starts speaking immediately, use 0:30"
   e.g. "earnings call: CEO speaks after 5-10 minute intro, use 8:00"
5. If no reliable source exists for this specific subject, set strategy to "general_search"

Return ONLY valid JSON, no explanation:
{
  "strategy": "channel_specific" | "general_search",
  "subject": "exact subject name",
  "primary_queries": [
    { "query": "specific search query", "channel_filter": "channel name or null" }
  ],
  "fallback_query": "broader fallback search query",
  "avoid_terms": ["reaction", "commentary", "compilation", "review", "shorts"],
  "timestamp_hint": {
    "start_seconds": 30,
    "reasoning": "brief explanation of why this timestamp"
  },
  "min_video_duration": 120,
  "confidence": 0.0
}`;

  try {
    const response = await callClaude(
      prompt,
      'You are a documentary researcher. Return only valid JSON with no markdown.'
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const strategy = JSON.parse(jsonMatch[0]);

    console.log(
      `[clipIntelligence] strategy for scene ${scene.scene_id}:`,
      strategy.strategy, '| subject:', strategy.subject,
      '| confidence:', strategy.confidence,
      '| start:', strategy.timestamp_hint?.start_seconds + 's'
    );

    return strategy;
  } catch (err) {
    console.warn('[clipIntelligence] Claude strategy failed:', err.message);
    return {
      strategy: 'general_search',
      subject: anchors[0] || excerpt.slice(0, 30),
      primary_queries: [{ query: `${anchors.slice(0, 2).join(' ')} documentary footage interview`, channel_filter: null }],
      fallback_query: anchors.slice(0, 3).join(' ') + ' footage',
      avoid_terms: ['reaction', 'commentary', 'compilation', 'review', 'shorts'],
      timestamp_hint: { start_seconds: 30, reasoning: 'default skip intro' },
      min_video_duration: 60,
      confidence: 0.3,
    };
  }
}

module.exports = { buildClipStrategy, KNOWN_CHANNELS };
