// Number expansion, abbreviation normalisation, and pause-marker insertion for TTS.
// This runs BEFORE the existing textPreprocessor (which handles markdown and splitting).

const NUMBER_EXPANSIONS = [
  // Currency with word suffix
  [/\$(\d+(?:\.\d+)?)\s*[Tt]rillion/g, (_, n) => `${n} trillion dollars`],
  [/\$(\d+(?:\.\d+)?)\s*[Bb]illion/g,  (_, n) => `${n} billion dollars`],
  [/\$(\d+(?:\.\d+)?)\s*[Mm]illion/g,  (_, n) => `${n} million dollars`],
  // Currency with letter suffix
  [/\$(\d+(?:\.\d+)?)[Tt]/g,            (_, n) => `${n} trillion dollars`],
  [/\$(\d+(?:\.\d+)?)[Bb]/g,            (_, n) => `${n} billion dollars`],
  [/\$(\d+(?:\.\d+)?)[Mm]/g,            (_, n) => `${n} million dollars`],
  [/\$(\d+(?:\.\d+)?)[Kk]/g,            (_, n) => `${n} thousand dollars`],
  [/\$(\d+(?:\.\d+)?)/g,                (_, n) => `${n} dollars`],
  // Percentages
  [/(\d+(?:\.\d+)?)%/g, (_, n) => `${n} percent`],
  // Large number abbreviations (standalone)
  [/\b(\d+(?:\.\d+)?)T\b/g, (_, n) => `${n} trillion`],
  [/\b(\d+(?:\.\d+)?)B\b/g, (_, n) => `${n} billion`],
  [/\b(\d+(?:\.\d+)?)M\b/g, (_, n) => `${n} million`],
  [/\b(\d+(?:\.\d+)?)K\b/g, (_, n) => `${n} thousand`],
  // Abbreviations
  [/\bCEO\b/g,    'Chief Executive Officer'],
  [/\bCFO\b/g,    'Chief Financial Officer'],
  [/\bCTO\b/g,    'Chief Technology Officer'],
  [/\bCOO\b/g,    'Chief Operating Officer'],
  [/\bIPO\b/g,    'I P O'],
  [/\bNYSE\b/g,   'New York Stock Exchange'],
  [/\bNASDAQ\b/g, 'NASDAQ'],
  [/\bSEC\b/g,    'S E C'],
  [/\bFTC\b/g,    'F T C'],
  [/\bDOJ\b/g,    'Department of Justice'],
  [/\bAI\b/g,     'A I'],
  [/\bAPI\b/g,    'A P I'],
  [/\bSaaS\b/g,   'software as a service'],
  [/\bR&D\b/g,    'research and development'],
  [/\bQ([1-4])\b/g, (_, q) => `Q ${q}`],
  [/\bvs\.\b/gi,  'versus'],
  [/\betc\.\b/gi, 'and so on'],
  [/\be\.g\.\b/gi,'for example'],
  [/\bi\.e\.\b/gi,'that is'],
]

function expandNumbers(text) {
  let result = text
  for (const [pattern, replacement] of NUMBER_EXPANSIONS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// SSML break tags supported by ElevenLabs Multilingual v2
const PAUSE_RULES = [
  // Em dash — dramatic pause
  [/\s*—\s*/g,      '<break time="0.6s"/> '],
  // Ellipsis — trailing pause
  [/\.\.\./g,       '<break time="0.5s"/>'],
  // High-impact transitional phrases
  [/\b(but then|until|suddenly|overnight|everything changed|in an instant|within months|within weeks|within days|for the first time|all of this|none of it)\b/gi,
    (m) => `<break time="0.4s"/>${m}`],
  // After colon introducing a list or reveal
  [/:\s+/g,         ':<break time="0.3s"/> '],
  // Micro-pause between sentences
  [/\.\s+([A-Z])/g, (_, next) => `.<break time="0.25s"/> ${next}`],
]

function insertPauseMarkers(text) {
  let result = text
  for (const [pattern, replacement] of PAUSE_RULES) {
    result = result.replace(pattern, replacement)
  }
  return result
}

function preprocessForTTS(text, options = {}) {
  const { expandNums = true, addPauses = true, mood = 'neutral' } = options
  let processed = (text || '').trim()

  // 1. Expand numbers and abbreviations
  if (expandNums) processed = expandNumbers(processed)

  // 2. Insert pause markers
  if (addPauses) processed = insertPauseMarkers(processed)

  // 3. Mood-specific: extra sentence pauses for reflective/somber delivery
  if (mood === 'somber' || mood === 'reflective') {
    processed = processed.replace(/\.\s+([A-Z])/g, (_, next) => `.<break time="0.4s"/> ${next}`)
  }

  return processed
}

module.exports = { preprocessForTTS, expandNumbers, insertPauseMarkers }
