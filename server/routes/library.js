const router  = require('express').Router()
const fs      = require('fs')
const path    = require('path')
const { matchClips, loadClips } = require('../services/clipMatcher')

const LIBRARY_PATH = path.join(__dirname, '../../library/clips.json')
const GAPS_PATH    = path.join(__dirname, '../../library/gaps.json')

// Appends to gaps.json — skips if identical tag set already logged
function logGap(scene_id, tags) {
  let gaps = []
  try { gaps = JSON.parse(fs.readFileSync(GAPS_PATH, 'utf8')).gaps } catch {}

  const tagKey = [...(tags || [])].map(t => t.toLowerCase().trim()).sort().join(',')
  const isDuplicate = gaps.some(g => {
    const k = [...(g.tags || [])].map(t => t.toLowerCase().trim()).sort().join(',')
    return k === tagKey
  })
  if (isDuplicate) return

  gaps.push({ scene_id, tags, timestamp: new Date().toISOString() })
  try { fs.writeFileSync(GAPS_PATH, JSON.stringify({ gaps }, null, 2)) } catch {}
}

// ── GET /api/library — list all clips, optional ?q=&category=&mood= ──────────
router.get('/', (req, res) => {
  try {
    let clips = loadClips()
    const { q, category, mood } = req.query

    if (q) {
      const ql = q.toLowerCase()
      clips = clips.filter(c =>
        c.tags.some(t => t.includes(ql)) ||
        c.category.toLowerCase().includes(ql) ||
        (c.description || '').toLowerCase().includes(ql)
      )
    }
    if (category) clips = clips.filter(c => c.category === category)
    if (mood)     clips = clips.filter(c => c.mood === mood)

    const all        = loadClips()
    const categories = [...new Set(all.map(c => c.category))].sort()
    const moods      = [...new Set(all.map(c => c.mood))].sort()

    res.json({ clips, total: clips.length, categories, moods })
  } catch (err) {
    console.error('[library] GET error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/library/gaps — gap insights ─────────────────────────────────────
// Must be declared BEFORE /:clip_id to avoid Express matching "gaps" as a param
router.get('/gaps', (req, res) => {
  try {
    let gaps = []
    try { gaps = JSON.parse(fs.readFileSync(GAPS_PATH, 'utf8')).gaps } catch {}

    // Most recent first
    gaps = [...gaps].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    const tagCount = {}
    gaps.forEach(g => {
      ;(g.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1 })
    })
    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag)

    res.json({ gaps, total: gaps.length, topTags })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/match — find top 3 clips for a scene ───────────────────
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

// ── POST /api/library/match-all — bulk match ─────────────────────────────────
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

// ── POST /api/library/add — add a new clip entry ─────────────────────────────
router.post('/add', (req, res) => {
  try {
    const { file, tags, mood, category, duration, description, source_url } = req.body
    if (!file || !Array.isArray(tags) || !mood || !category) {
      return res.status(400).json({ error: 'file, tags (array), mood, and category are required' })
    }

    const raw  = fs.readFileSync(LIBRARY_PATH, 'utf8')
    const data = JSON.parse(raw)

    const maxId = data.clips.reduce((max, c) => {
      const n = parseInt(c.clip_id, 10)
      return isNaN(n) ? max : Math.max(max, n)
    }, 0)
    const clip_id = String(maxId + 1).padStart(3, '0')

    const clip = {
      clip_id,
      file,
      tags:        tags.map(t => t.toLowerCase().trim()).filter(Boolean),
      mood,
      category,
      duration:    parseInt(duration, 10) || 0,
      description: description || '',
      source_url:  source_url  || '',
    }

    data.clips.push(clip)
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2))
    console.log(`[library] added clip ${clip_id}: ${file}`)
    res.json({ clip, total: data.clips.length })
  } catch (err) {
    console.error('[library] add error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/library/:clip_id — remove a clip ─────────────────────────────
router.delete('/:clip_id', (req, res) => {
  try {
    const { clip_id } = req.params
    const raw  = fs.readFileSync(LIBRARY_PATH, 'utf8')
    const data = JSON.parse(raw)

    const before = data.clips.length
    data.clips = data.clips.filter(c => c.clip_id !== clip_id)

    if (data.clips.length === before) {
      return res.status(404).json({ error: `Clip ${clip_id} not found` })
    }

    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2))
    console.log(`[library] deleted clip ${clip_id}`)
    res.json({ ok: true, total: data.clips.length })
  } catch (err) {
    console.error('[library] delete error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
