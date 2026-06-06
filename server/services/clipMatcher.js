const clipStore = require('./clipStore')

// License quality bonus — prefer freely usable clips
const LICENSE_BONUS = {
  public_domain:    0.3,
  creative_commons: 0.3,
  fair_use:         0.1,
  unknown:          0,
}

// Returns up to `limit` clips sorted by tag overlap + mood + license score
function matchClips(searchTags, mood = null, limit = 3) {
  if (!searchTags?.length) return []

  const clips  = clipStore.loadClips()
  const tagSet = new Set(searchTags.map(t => t.toLowerCase().trim()))

  const scored = clips
    .map(clip => {
      const clipTags    = (clip.tags || []).map(t => t.toLowerCase())
      const overlap     = clipTags.filter(t => tagSet.has(t)).length
      const moodBonus   = (mood && clip.mood === mood) ? 0.5 : 0
      const licBonus    = LICENSE_BONUS[clip.license] ?? 0
      return { clip, score: overlap + moodBonus + licBonus }
    })
    .filter(c => c.score > 0)

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(c => c.clip)
}

// Re-export loadClips for routes that still call matchClips module
function loadClips() { return clipStore.loadClips() }

module.exports = { matchClips, loadClips }
