const router  = require('express').Router()
const fs      = require('fs')
const path    = require('path')
const crypto  = require('crypto')
const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)
const multer  = require('multer')

const CLIPS_DIR        = path.join(__dirname, '../../library/clips')
const REMOTION_CLIPS   = path.resolve(__dirname, '../../remotion/public/clips')

// Keep remotion/public/clips/ in sync whenever a new clip lands in library/clips/
function syncSingleClipToRemotion(filename) {
  const src  = path.join(CLIPS_DIR, filename)
  const dest = path.join(REMOTION_CLIPS, filename)
  try {
    if (!fs.existsSync(REMOTION_CLIPS)) fs.mkdirSync(REMOTION_CLIPS, { recursive: true })
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.copyFileSync(src, dest)
      console.log('[library] synced to remotion:', filename)
    }
  } catch (err) {
    console.warn('[library] remotion sync failed (non-fatal):', err.message)
  }
}

const storage = multer.diskStorage({
  destination: CLIPS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4'
    cb(null, `manual_${crypto.randomUUID()}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^video\/(mp4|quicktime|webm)$/.test(file.mimetype)
    cb(ok ? null : new Error('Only mp4, mov, and webm files are accepted'), ok)
  },
})

async function getVideoDuration(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`
    )
    const d = parseFloat(stdout.trim())
    return isNaN(d) ? null : Math.round(d)
  } catch {
    return null
  }
}

const { matchClips }  = require('../services/clipMatcher')
const clipStore        = require('../services/clipStore')
const { checkYtDlp, generateDescription }  = require('../services/ytdlp')
const youtubeCC        = require('../services/sources/youtubeCC')
const youtubeFairUse   = require('../services/sources/youtubeFairUse')
const internetArchive  = require('../services/sources/internetArchive')
const cspan            = require('../services/sources/cspan')
const { searchTED }    = require('../services/sources/ted')
// clipSeeder removed in simple branch
const { downloadClip, MAX_SECONDS } = require('../services/clipDownloader')
const { buildFootageQuery } = require('../services/sources/searchUtils')
const { scoreResults }      = require('../services/resultScorer')

// Map route-slug source identifiers → internal source identifiers
const SOURCE_NORM = {
  'youtube-cc':       'youtube_cc',
  'youtube-fair-use': 'youtube_fair_use',
  'archive':          'internet_archive',
  'cspan':            'cspan',
  'ted':              'ted',
}

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
    const { query, maxResults = 8, context, sceneContext } = req.body
    if (!query) return res.status(400).json({ error: 'query is required' })
    const enhanced = buildFootageQuery(query, context)
    let results = await youtubeCC.search(enhanced, maxResults)
    results = await scoreResults(results, query, sceneContext)
    res.json({ results: results.slice(0, 5), total: results.length })
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
    const { query, maxResults = 8, context, sceneContext } = req.body
    if (!query) return res.status(400).json({ error: 'query is required' })
    const enhanced = buildFootageQuery(query, context)
    let results = await youtubeFairUse.search(enhanced, maxResults)
    results = await scoreResults(results, query, sceneContext)
    res.json({ results: results.slice(0, 5), total: results.length })
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
    const { query, maxResults = 8, context, sceneContext } = req.body
    if (!query) return res.status(400).json({ error: 'query is required' })
    const enhanced = buildFootageQuery(query, context)
    let results = await internetArchive.search(enhanced, maxResults)
    results = await scoreResults(results, query, sceneContext)
    res.json({ results: results.slice(0, 5), total: results.length })
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
    const { query, maxResults = 8, context, sceneContext } = req.body
    if (!query) return res.status(400).json({ error: 'query is required' })
    const enhanced = buildFootageQuery(query, context)
    let results = await cspan.search(enhanced, maxResults)
    results = await scoreResults(results, query, sceneContext)
    res.json({ results: results.slice(0, 5), total: results.length })
  } catch (err) {
    console.error('[library] cspan search error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/library/search/ted ─────────────────────────────────────────────
router.post('/search/ted', async (req, res) => {
  try {
    const { query, maxResults = 8, sceneContext } = req.body
    if (!query) return res.status(400).json({ error: 'query is required' })
    let results = await searchTED(buildFootageQuery(query, 'person'), maxResults)
    results = await scoreResults(results, query, sceneContext)
    res.json({ results: results.slice(0, 5), total: results.length })
  } catch (err) {
    console.error('[library] ted search error:', err.message)
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

// seed endpoints removed in simple branch

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

// ── POST /api/library/download — unified SSE download for all sources ─────────
// Streams progress events: start → trimming → generating_description → saving → done | error
router.post('/download', async (req, res) => {
  const { url, startSec, endSec, source: rawSource, tags = [], mood = 'neutral', category = 'general', title = '', projectId = null } = req.body
  if (!url || !rawSource) return res.status(400).json({ error: 'url and source are required' })

  // Normalise route-slug identifiers to internal identifiers
  const source  = SOURCE_NORM[rawSource] || rawSource
  // startSec defaults to DEFAULT_START_OFFSET inside clipDownloader — no need to set here
  const start   = (startSec != null && Number(startSec) > 0) ? Number(startSec) : 25
  const end     = endSec != null ? Math.min(Number(endSec), start + MAX_SECONDS) : start + MAX_SECONDS
  const dur     = end - start
  if (dur <= 0) return res.status(400).json({ error: 'Invalid time range' })
  if (dur > MAX_SECONDS) return res.status(400).json({ error: `Max ${MAX_SECONDS}s per clip` })

  const license = source === 'youtube_cc'       ? 'creative_commons'
                : source === 'internet_archive' ? 'public_domain'
                : source === 'cspan'            ? 'public_domain'
                : source === 'ted'             ? 'creative_commons'
                : 'fair_use'
  const warning = license === 'fair_use'
    ? 'Copyrighted content. Fair use for documentary/commentary only. 8 seconds max.'
    : null

  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    send({ type: 'start', message: 'Downloading…' })

    const clipData = await downloadClip({ url, startSec: start, endSec: end, source, tags, mood, category, license, title, warning, projectId })

    send({ type: 'generating_description', message: 'Generating description…' })
    clipData.description = await generateDescription(clipData.title, clipData.tags)

    send({ type: 'saving', message: 'Saving to library…' })
    const saved = clipStore.addClip(clipData)
    syncSingleClipToRemotion(path.basename(saved.file))

    send({ type: 'done', clip: saved })
    res.end()
  } catch (err) {
    console.error('[library/download]', err.message)
    send({ type: 'error', message: err.message })
    res.end()
  }
})

// ── POST /api/library/upload — multipart upload of a clip file ───────────────
router.post('/upload', upload.single('clip'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const { title, tags: tagsRaw, mood, category, license, source_url } = req.body
    if (!title || !mood || !category) {
      fs.unlinkSync(req.file.path)
      return res.status(400).json({ error: 'title, mood, and category are required' })
    }

    const tags = (tagsRaw || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    const filename = req.file.filename
    const filePath = path.join(CLIPS_DIR, filename)
    const duration = await getVideoDuration(filePath)

    const clip = clipStore.addClip({
      file: `/library/clips/${filename}`,
      title,
      source: 'manual',
      license: license || 'unknown',
      source_url: source_url || '',
      tags,
      mood,
      category,
      duration,
      description: '',
      warning: license === 'fair_use'
        ? 'Copyrighted content. Fair use for documentary/commentary only.'
        : null,
      project_id: null,
    })

    syncSingleClipToRemotion(filename)
    console.log(`[library] uploaded clip ${clip.clip_id} — ${filename} — ${duration}s`)
    res.json({ clip })
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path) } catch { /* */ }
    console.error('[library] upload error:', err.message)
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
