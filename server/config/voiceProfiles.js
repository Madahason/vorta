// Per-mood voice delivery settings for ElevenLabs.
// stability: lower = more emotive, higher = more consistent
// similarity_boost: how closely to match the trained voice
// style: style exaggeration (0 = default delivery, 1 = heavy stylisation)
// speed: relative speaking pace (1.0 = normal)

const MOOD_VOICE_SETTINGS = {
  tense: {
    stability:       0.35,
    similarityBoost: 0.85,
    style:           0.45,
    speed:           0.92,
    description:     'Urgent, clipped delivery — builds pressure',
  },
  dramatic: {
    stability:       0.30,
    similarityBoost: 0.88,
    style:           0.55,
    speed:           0.90,
    description:     'Big swings in energy — peaks and valleys',
  },
  triumphant: {
    stability:       0.40,
    similarityBoost: 0.82,
    style:           0.65,
    speed:           1.05,
    description:     'Confident, rising energy — celebratory momentum',
  },
  somber: {
    stability:       0.65,
    similarityBoost: 0.80,
    style:           0.15,
    speed:           0.85,
    description:     'Measured, mournful — weight in every word',
  },
  reflective: {
    stability:       0.60,
    similarityBoost: 0.78,
    style:           0.10,
    speed:           0.88,
    description:     'Quiet, introspective — space between thoughts',
  },
  neutral: {
    stability:       0.50,
    similarityBoost: 0.82,
    style:           0.20,
    speed:           1.00,
    description:     'Clear, professional narration — baseline',
  },
  anticipatory: {
    stability:       0.38,
    similarityBoost: 0.85,
    style:           0.40,
    speed:           0.95,
    description:     'Breath-held, forward-leaning — what happens next?',
  },
  institutional: {
    stability:       0.70,
    similarityBoost: 0.80,
    style:           0.05,
    speed:           0.98,
    description:     'Authoritative, formal — credibility over emotion',
  },
}

// Common synonym → canonical mood name
const MOOD_ALIASES = {
  tense:         'tense',
  urgent:        'tense',
  suspenseful:   'tense',
  dramatic:      'dramatic',
  intense:       'dramatic',
  triumphant:    'triumphant',
  celebratory:   'triumphant',
  victorious:    'triumphant',
  somber:        'somber',
  sad:           'somber',
  grave:         'somber',
  melancholic:   'somber',
  reflective:    'reflective',
  contemplative: 'reflective',
  nostalgic:     'reflective',
  neutral:       'neutral',
  informational: 'neutral',
  factual:       'neutral',
  anticipatory:  'anticipatory',
  suspense:      'anticipatory',
  buildup:       'anticipatory',
  institutional: 'institutional',
  authoritative: 'institutional',
  formal:        'institutional',
}

const DEFAULT_VOICE_PROFILE = MOOD_VOICE_SETTINGS.neutral

function getMoodSettings(mood = 'neutral') {
  const canonical = MOOD_ALIASES[(mood || '').toLowerCase().trim()]
  return MOOD_VOICE_SETTINGS[canonical] || DEFAULT_VOICE_PROFILE
}

module.exports = { MOOD_VOICE_SETTINGS, MOOD_ALIASES, getMoodSettings, DEFAULT_VOICE_PROFILE }
