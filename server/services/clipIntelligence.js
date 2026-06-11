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

  const prompt = `You are a documentary researcher finding EXACT footage of a specific subject.

Scene context:
Script: "${excerpt}"
Subject anchors: ${JSON.stringify(scene.subject_anchors || [])}
Mood: ${mood}
Known reliable channels: ${JSON.stringify(knownSources)}

CRITICAL RULES for search queries:
1. Every query MUST contain the exact subject name (e.g. "Netflix", "Reed Hastings", "iPhone")
2. NEVER write generic queries like "documentary footage interview speech" without the subject name
3. Queries must be specific enough that ONLY videos about this exact subject would match
4. If the subject is a company, search for: "[Company name] [specific event/person/year]"
5. If the subject is a person, search for: "[Full name] [speech/interview/keynote/testimony]"

BAD query (too generic): "streaming service documentary footage"
GOOD query: "Netflix Reed Hastings interview 2019"

BAD query: "tech company announcement speech"
GOOD query: "Netflix earnings call Q3 2022 Reed Hastings"

For the timestamp hint:
- Company earnings calls: executives speak around 8-12 minutes in (use 480)
- Conference keynotes: presenter appears 2-5 minutes in after intro (use 150)
- News interviews: subject speaks immediately (use 30)
- Senate/congressional hearings: CEO testimony starts 30-60 minutes in (use 1800)
- Product launches: demo starts 10-20 minutes in (use 720)
- Documentary films: use 120 seconds as default

Return ONLY valid JSON, no explanation:
{
  "strategy": "channel_specific" | "general_search",
  "subject": "exact subject name from anchors",
  "primary_queries": [
    { "query": "MUST contain subject name", "channel_filter": "channel name or null" }
  ],
  "fallback_query": "subject name + broader terms",
  "avoid_terms": ["reaction", "commentary", "compilation", "review", "shorts", "top 10"],
  "timestamp_hint": { "start_seconds": 30, "reasoning": "why this timestamp" },
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
    const primarySubject = anchors[0] || excerpt.slice(0, 30);
    return {
      strategy: 'general_search',
      subject: primarySubject,
      primary_queries: [{ query: `${primarySubject} interview speech`, channel_filter: null }],
      fallback_query: `${primarySubject} documentary`,
      avoid_terms: ['reaction', 'commentary', 'compilation', 'review', 'shorts'],
      timestamp_hint: { start_seconds: 30, reasoning: 'default skip intro' },
      min_video_duration: 60,
      confidence: 0.3,
    };
  }
}

module.exports = { buildClipStrategy, KNOWN_CHANNELS };
