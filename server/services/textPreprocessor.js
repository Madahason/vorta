function preprocessForTTS(text) {
  if (!text) return ''

  let cleaned = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.{2,}/g, '.')
    .replace(/,{2,}/g, ',')
    .replace(/!{2,}/g, '!')
    .replace(/\?{2,}/g, '?')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/`/g, '')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.,!?;:])\s{2,}/g, '$1 ')
    .replace(/\b(\w+)\s+\1\b/gi, '$1')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
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

// Split long text at natural sentence boundaries
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
