const fs   = require('fs')
const path = require('path')

const LIBRARY_PATH = path.join(__dirname, '../../library/clips.json')

function loadClips() {
  const raw = fs.readFileSync(LIBRARY_PATH, 'utf8')
  return JSON.parse(raw).clips
}

// Returns up to `limit` clips sorted by tag overlap score (highest first).
// Ties are broken by mood match.
function matchClips(searchTags, mood = null, limit = 3) {
  if (!searchTags?.length) return []

  const clips    = loadClips()
  const tagSet   = new Set(searchTags.map(t => t.toLowerCase().trim()))

  const scored = clips
    .map(clip => {
      const clipTags = clip.tags.map(t => t.toLowerCase())
      const overlap  = clipTags.filter(t => tagSet.has(t)).length
      const moodBonus = (mood && clip.mood === mood) ? 0.5 : 0
      return { clip, score: overlap + moodBonus }
    })
    .filter(c => c.score > 0)

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(c => c.clip)
}

module.exports = { matchClips, loadClips }
