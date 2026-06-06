const router  = require('express').Router()
const fs      = require('fs')
const path    = require('path')

const { matchClips }  = require('../services/clipMatcher')
const clipStore        = require('../services/clipStore')
const { checkYtDlp }  = require('../services/ytdlp')
const youtubeCC        = require('../services/sources/youtubeCC')
const youtubeFairUse   = require('../services/sources/youtubeFairUse')
const internetArchive  = require('../services/sources/internetArchive')
const cspan            = require('../services/sources/cspan')
const { startSeed, addClient, removeClient } = require('../services/clipSeeder')

const GAPS_PATH = path.join(__dirname, '../../library/gaps.json')
const PROJECTS_DIR = path.join(__dirname, '../../library/projects')

function logGap(scene_id, tags) {
  let gaps = []
  try { gaps = JSON.parse(fs.readFileSync(GAPS_PATH, 'utf8')).gaps } catch { /* */ }
  const tagKey      = [...(tags || [])].map(t => t.toLowerCase().trim()).sort().join(',')
  const isDuplicate = gaps.some(g => {
    const k = [...(g.tags || [])].map(t => t.toLowerCase().trim()).sort().join(',')
    return k === tagKey
  })
  if (isDuplicate) return
  gaps.push({ scene_id, tags, timestamp: new Date().toISOString() })
  try { fs.writeFileSync(GAPS_PATH, JSON.stringify({ gaps }, null, 2)) } catch { /* */ }
}

// ── GET /api/library/status — yt-dlp status + clip count breakdown ────────────
router.get('/status', async (req, res) => {
  try {
    const ytdlp  = await checkYtDlp()
    const clips  = clipStore.loadClips()
    const bySource = {}
    for (const c of clips) {
      bySource[c.source] = (bySource[c.source] || 0) + 1
    }
    res.json({ ytdlp, totalClips: clips.length, sources: bySource })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/library — list all clips ────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    let clips = clipStore.loadClips()
    const { q, category, mood } = req.query

    if (q) {
      const ql = q.toLowerCase()
      clips = clips.filter(c =>
        (c.tags || []).some(t => t.includes(ql)) ||
        (c.category || '').toLowerCase().includes(ql) ||
        (c.description || '').toLowerCase().includes(ql) ||
        (c.title || '').toLowerCase().includes(ql)
      )
    }
    if (category) clips = clips.filter(c => c.category === category)
    if (mood)     clips = clips.filter(c => c.mood === mood)

    const all        = clipStore.loadClips()
    const categories = [...new Set(all.map(c => c.category))].sort()
    const moods      = [...new Set(all.map(c => c.mood))].sort()

    res.json({ clips, total: clips.length, categories, moods })
  } catch (err) {
    console.error('[library] GET error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/library/gaps ─────────────────────────────────────────────────────
router.get('/gaps', (req, res) => {
  try {
    let gaps = []
    try { gaps = JSON.parse(fs.readFileSync(GAPS_PATH, 'utf8')).gaps } catch { /* */ }
    gaps = [...gaps].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    const tagCount = {}
    gaps.forEach(g => { (g.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1 }) })
    const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag]) => tag)
    res.json({ gaps, total: gaps.length, topTags })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/match ───────────────────────────────────────────────────
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

// ── POST /api/library/match-all ───────────────────────────────────────────────
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

// ── POST /api/library/add — manual clip add ───────────────────────────────────
router.post('/add', (req, res) => {
  try {
    const { file, tags, mood, category, duration, description, source_url, title, license, warning, project_id } = req.body
    if (!file || !Array.isArray(tags) || !mood || !category) {
      return res.status(400).json({ error: 'file, tags (array), mood, and category are required' })
    }
    const clip = clipStore.addClip({ file, tags, mood, category, duration, description, source_url, title, license, warning, project_id, source: 'manual' })
    const all  = clipStore.loadClips()
    res.json({ clip, total: all.length })
  } catch (err) {
    console.error('[library] add error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/search/youtube-cc ──────────────────────────────────────
router.post('/search/youtube-cc', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body
    if (!query) return res.status(400).json({ error: 'query is required' })
    const results = await youtubeCC.search(query, maxResults)
    res.json({ results, total: results.length })
  } catch (err) {
    console.error('[library] youtube-cc search error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/download/youtube-cc ────────────────────────────────────
router.post('/download/youtube-cc', async (req, res) => {
  try {
    const { url, startSec, endSec, tags, mood, category, projectId, title } = req.body
    if (!url || startSec == null || endSec == null) {
      return res.status(400).json({ error: 'url, startSec, and endSec are required' })
    }
    const clip = await youtubeCC.download({ url, startSec: Number(startSec), endSec: Number(endSec), tags, mood, category, projectId, title })
    res.json({ clip })
  } catch (err) {
    console.error('[library] youtube-cc download error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/search/youtube-fair-use ────────────────────────────────
router.post('/search/youtube-fair-use', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body
    if (!query) return res.status(400).json({ error: 'query is required' })
    const results = await youtubeFairUse.search(query, maxResults)
    res.json({ results, total: results.length })
  } catch (err) {
    console.error('[library] youtube-fair-use search error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/download/youtube-fair-use ──────────────────────────────
router.post('/download/youtube-fair-use', async (req, res) => {
  try {
    const { url, startSec, endSec, tags, mood, category, projectId, title } = req.body
    if (!url || startSec == null || endSec == null) {
      return res.status(400).json({ error: 'url, startSec, and endSec are required' })
    }
    const clip = await youtubeFairUse.download({ url, startSec: Number(startSec), endSec: Number(endSec), tags, mood, category, projectId, title })
    res.json({ clip })
  } catch (err) {
    console.error('[library] youtube-fair-use download error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/search/archive ─────────────────────────────────────────
router.post('/search/archive', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body
    if (!query) return res.status(400).json({ error: 'query is required' })
    const results = await internetArchive.search(query, maxResults)
    res.json({ results, total: results.length })
  } catch (err) {
    console.error('[library] archive search error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/download/archive ───────────────────────────────────────
router.post('/download/archive', async (req, res) => {
  try {
    const { identifier, url, tags, mood, category, projectId, title } = req.body
    if (!identifier && !url) return res.status(400).json({ error: 'identifier or url is required' })
    const clip = await internetArchive.download({ identifier, url, tags, mood, category, projectId, title })
    res.json({ clip })
  } catch (err) {
    console.error('[library] archive download error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/search/cspan ───────────────────────────────────────────
router.post('/search/cspan', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body
    if (!query) return res.status(400).json({ error: 'query is required' })
    const results = await cspan.search(query, maxResults)
    res.json({ results, total: results.length })
  } catch (err) {
    console.error('[library] cspan search error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/download/cspan ─────────────────────────────────────────
router.post('/download/cspan', async (req, res) => {
  try {
    const { url, startSec, endSec, tags, mood, category, projectId, title } = req.body
    if (!url) return res.status(400).json({ error: 'url is required' })
    const clip = await cspan.download({ url, startSec: startSec != null ? Number(startSec) : null, endSec: endSec != null ? Number(endSec) : null, tags, mood, category, projectId, title })
    res.json({ clip })
  } catch (err) {
    console.error('[library] cspan download error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/import-url — auto-detect source from URL ───────────────
router.post('/import-url', async (req, res) => {
  try {
    const { url, startSec, endSec, tags, mood, category, projectId, title } = req.body
    if (!url) return res.status(400).json({ error: 'url is required' })

    let clip = null
    if (url.includes('archive.org')) {
      clip = await internetArchive.download({ url, tags, mood, category, projectId, title })
    } else if (url.includes('c-span.org')) {
      clip = await cspan.download({ url, startSec: startSec != null ? Number(startSec) : null, endSec: endSec != null ? Number(endSec) : null, tags, mood, category, projectId, title })
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      if (startSec != null && endSec != null && (endSec - startSec) <= youtubeFairUse.MAX_FAIR_USE_SECONDS) {
        clip = await youtubeFairUse.download({ url, startSec: Number(startSec), endSec: Number(endSec), tags, mood, category, projectId, title })
      } else if (startSec != null && endSec != null) {
        clip = await youtubeCC.download({ url, startSec: Number(startSec), endSec: Number(endSec), tags, mood, category, projectId, title })
      } else {
        return res.status(400).json({ error: 'YouTube imports require startSec and endSec' })
      }
    } else {
      return res.status(400).json({ error: 'Unsupported URL. Use archive.org, c-span.org, youtube.com, or youtu.be.' })
    }

    res.json({ clip })
  } catch (err) {
    console.error('[library] import-url error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/seed — start auto-seed job ─────────────────────────────
router.post('/seed', (req, res) => {
  try {
    const { title, niche, projectId, maxClips } = req.body
    const seedId = startSeed({ title, niche, projectId, maxClips })
    res.json({ seedId })
  } catch (err) {
    console.error('[library] seed error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/library/seed/progress/:seedId — SSE stream ──────────────────────
router.get('/seed/progress/:seedId', (req, res) => {
  const { seedId } = req.params

  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const ok = addClient(seedId, res)
  if (!ok) {
    res.write('data: {"type":"seed_error","error":"Seed job not found"}\n\n')
    return res.end()
  }

  req.on('close', () => removeClient(seedId, res))
})

// ── POST /api/library/fair-use-ack ───────────────────────────────────────────
router.post('/fair-use-ack', (req, res) => {
  try {
    const { projectId, clips } = req.body
    if (!projectId) return res.status(400).json({ error: 'projectId is required' })

    const dir  = path.join(PROJECTS_DIR, projectId)
    const file = path.join(dir, 'fair-use-acknowledgement.json')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify({
      projectId,
      acknowledgedAt: new Date().toISOString(),
      clips: clips || [],
    }, null, 2))

    console.log(`[library] fair-use ack logged for project ${projectId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('[library] fair-use-ack error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/library/verify — check which clip files actually exist on disk ───
router.get('/verify', (req, res) => {
  try {
    const clips = clipStore.loadClips()
    const verification = {}
    for (const clip of clips) {
      // clip.file is "/library/clips/filename.mp4" — resolve from project root
      const relPath  = clip.file.startsWith('/') ? clip.file.slice(1) : clip.file
      const filePath = path.join(__dirname, '../..', relPath)
      verification[clip.clip_id] = fs.existsSync(filePath)
    }
    res.json(verification)
  } catch (err) {
    console.error('[library] verify error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/library/:clip_id ─────────────────────────────────────────────
router.delete('/:clip_id', (req, res) => {
  try {
    const { clip_id } = req.params
    const ok = clipStore.removeClip(clip_id)
    if (!ok) return res.status(404).json({ error: `Clip ${clip_id} not found` })
    const all = clipStore.loadClips()
    console.log(`[library] deleted clip ${clip_id}`)
    res.json({ ok: true, total: all.length })
  } catch (err) {
    console.error('[library] delete error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
