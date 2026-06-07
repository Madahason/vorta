function preprocessForTTS(text) {
  if (!text) return ''

  let cleaned = text
    .replace(/\s+/g, ' ')
    .trim()
    // Normalize ellipsis to a pause-friendly period — ElevenLabs reads "..." as a stutter cue
    .replace(/\.\.\./g, '. ')
    // Fix repeated punctuation
    .replace(/\.{2,}/g, '.')
    .replace(/,{2,}/g, ',')
    .replace(/!{2,}/g, '!')
    .replace(/\?{2,}/g, '?')
    // Strip markdown artifacts that end up in script excerpts
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/`/g, '')
    // Remove Unicode non-breaking spaces and other invisible whitespace
    .replace(/[  -​  　]/g, ' ')
    // Fix spacing around punctuation
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.,!?;:])\s{2,}/g, '$1 ')
    // Remove clearly wrong duplicate adjacent words — only safe closed-class words.
    // We avoid removing open-class duplicates ("had had", "that that") which can be valid.
    .replace(/\b(the|a|an|is|are|was|were|and|or|but|in|on|at|to|for|of)\s+\1\b/gi, '$1')
    // Remove trailing hanging conjunctions/prepositions before terminal punctuation.
    // These appear when Claude cuts a scene excerpt mid-conjunction (e.g. "grew rapidly, and.")
    .replace(/\s+\b(and|or|but|nor|yet|so|for|the|a|an|of|in|to|with|at|by|from|that|which|who|as|if|when|where|how)\s*[.!?]$/i, '.')
    // Remove isolated single-letter fragments at end (e.g. " A." after a cut)
    .replace(/\s+[A-Za-z]\s*[.!?]$/, '.')
    // Normalize quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Clean up any double spaces introduced by the removals above
    .replace(/\s{2,}/g, ' ')
    .trim()
    // Ensure text ends with terminal punctuation so ElevenLabs commits to ending the sentence
    .replace(/([^.!?])$/, '$1.')

  if (cleaned.length < 10) return ''

  return cleaned
}

function validateTTSText(text) {
  const issues = []

  if (!text || text.trim().length === 0) {
    issues.push('Empty text')
  } else {
    if (text.length < 10) {
      issues.push('Text too short (min 10 characters)')
    }
    if (text.length > 2500) {
      issues.push('Text too long — split into smaller chunks (max 2500 chars)')
    }
    if (/^\W+$/.test(text)) {
      issues.push('Text contains only punctuation or symbols')
    }
  }

  return { valid: issues.length === 0, issues }
}

// Split long text at natural sentence boundaries.
// ElevenLabs performs best on 1-3 sentences per call.
function splitIntoChunks(text, maxChunkLength = 2500) {
  if (text.length <= maxChunkLength) return [text]

  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
  const chunks = []
  let current = ''

  for (const sentence of sentences) {
    if (current && (current + sentence).length > maxChunkLength) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current += sentence
    }
  }
  if (current) chunks.push(current.trim())

  return chunks.filter(c => c.length >= 10)
}

module.exports = { preprocessForTTS, validateTTSText, splitIntoChunks }
