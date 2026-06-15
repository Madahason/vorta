// Client-side mirror of server/services/voiceoverPreprocessor.js
// Used to preview processed text in VoiceoverPanel before generation.
// Keep in sync with the server version — no SSML is sent to ElevenLabs from here,
// this is only for display purposes.

const NUMBER_EXPANSIONS = [
  [/\$(\d+(?:\.\d+)?)\s*[Tt]rillion/g, (_, n) => `${n} trillion dollars`],
  [/\$(\d+(?:\.\d+)?)\s*[Bb]illion/g,  (_, n) => `${n} billion dollars`],
  [/\$(\d+(?:\.\d+)?)\s*[Mm]illion/g,  (_, n) => `${n} million dollars`],
  [/\$(\d+(?:\.\d+)?)[Tt]/g,            (_, n) => `${n} trillion dollars`],
  [/\$(\d+(?:\.\d+)?)[Bb]/g,            (_, n) => `${n} billion dollars`],
  [/\$(\d+(?:\.\d+)?)[Mm]/g,            (_, n) => `${n} million dollars`],
  [/\$(\d+(?:\.\d+)?)[Kk]/g,            (_, n) => `${n} thousand dollars`],
  [/\$(\d+(?:\.\d+)?)/g,                (_, n) => `${n} dollars`],
  [/(\d+(?:\.\d+)?)%/g, (_, n) => `${n} percent`],
  [/\b(\d+(?:\.\d+)?)T\b/g, (_, n) => `${n} trillion`],
  [/\b(\d+(?:\.\d+)?)B\b/g, (_, n) => `${n} billion`],
  [/\b(\d+(?:\.\d+)?)M\b/g, (_, n) => `${n} million`],
  [/\b(\d+(?:\.\d+)?)K\b/g, (_, n) => `${n} thousand`],
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

export function expandNumbers(text) {
  let result = text
  for (const [pattern, replacement] of NUMBER_EXPANSIONS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// Display version: shows [pause 0.6s] instead of SSML tags
const PAUSE_RULES_DISPLAY = [
  [/\s*—\s*/g,      ' [pause 0.6s] '],
  [/\.\.\./g,       '[pause 0.5s]'],
  [/\b(but then|until|suddenly|overnight|everything changed|in an instant|within months|within weeks|within days|for the first time|all of this|none of it)\b/gi,
    (m) => `[pause 0.4s]${m}`],
  [/:\s+/g,         ': [pause 0.3s] '],
  [/\.\s+([A-Z])/g, (_, next) => `. [pause 0.25s] ${next}`],
]

export function insertPauseMarkersDisplay(text) {
  let result = text
  for (const [pattern, replacement] of PAUSE_RULES_DISPLAY) {
    result = result.replace(pattern, replacement)
  }
  return result
}

export function preprocessForTTSDisplay(text, options = {}) {
  const { expandNums = true, addPauses = true } = options
  let processed = (text || '').trim()
  if (expandNums) processed = expandNumbers(processed)
  if (addPauses)  processed = insertPauseMarkersDisplay(processed)
  return processed
}
