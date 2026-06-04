const router  = require('express').Router()
const fs      = require('fs')
const path    = require('path')
const { matchClips, loadClips } = require('../services/clipMatcher')

const GAPS_PATH = path.join(__dirname, '../../library/gaps.json')

function logGap(scene_id, tags) {
  let gaps = []
  try { gaps = JSON.parse(fs.readFileSync(GAPS_PATH, 'utf8')).gaps } catch {}
  gaps.push({ scene_id, tags, timestamp: new Date().toISOString() })
  try { fs.writeFileSync(GAPS_PATH, JSON.stringify({ gaps }, null, 2)) } catch {}
}

// GET /api/library — list all clips with optional ?q=&category=&mood= filters
router.get('/', (req, res) => {
  try {
    let clips = loadClips()
    const { q, category, mood } = req.query

    if (q) {
      const ql = q.toLowerCase()
      clips = clips.filter(c =>
        c.tags.some(t => t.includes(ql)) ||
        c.category.toLowerCase().includes(ql) ||
        c.description.toLowerCase().includes(ql)
      )
    }
    if (category) clips = clips.filter(c => c.category === category)
    if (mood)     clips = clips.filter(c => c.mood === mood)

    const categories = [...new Set(loadClips().map(c => c.category))].sort()
    const moods      = [...new Set(loadClips().map(c => c.mood))].sort()

    res.json({ clips, total: clips.length, categories, moods })
  } catch (err) {
    console.error('[library] GET error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/library/match — find top 3 clips for a scene's tags
router.post('/match', (req, res) => {
  try {
    const { tags, scene_id, mood } = req.body
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' })

    const matches = matchClips(tags, mood || null, 3)

    if (!matches.length) {
      console.log(`[library] no matches for scene ${scene_id} — tags: [${tags.join(', ')}]`)
      logGap(scene_id, tags)
    }

    res.json({ matches, scene_id, total: matches.length })
  } catch (err) {
    console.error('[library] match error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/library/match-all — bulk match for all real_footage scenes at once
router.post('/match-all', (req, res) => {
  try {
    const { scenes } = req.body
    if (!Array.isArray(scenes)) return res.status(400).json({ error: 'scenes must be an array' })

    const results = {}
    scenes.forEach(scene => {
      if (scene.shot_type !== 'real_footage') return
      const matches = matchClips(scene.clip_search_tags || [], scene.mood, 3)
      if (!matches.length) logGap(scene.scene_id, scene.clip_search_tags || [])
      results[scene.scene_id] = matches
    })

    res.json({ results })
  } catch (err) {
    console.error('[library] match-all error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
