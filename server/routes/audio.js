const router = require('express').Router()
const path   = require('path')
const fs     = require('fs')

const { buildProjectAudioSpecs, buildProjectAudioSpecsCached, VOLUME_LEVELS } = require('../services/audioMixer')
const { searchMusic, getMusicForMood, loadMusicIndex }                        = require('../services/pixabayMusic')
const { listAmbientFiles }                                                     = require('../services/ambientLibrary')
const transitionStings                                                         = require('../config/transitionStings')

const STINGS_DIR = path.resolve(__dirname, '../../library/stings')

// ── POST /upload?projectId=xxx — receive raw audio file ──────────────────────
router.post('/upload', (req, res) => {
  const { projectId } = req.query
  const originalName  = req.headers['x-filename'] || 'narration.mp3'

  if (!projectId) return res.status(400).json({ error: 'projectId query param required' })

  const audioDir = path.resolve(__dirname, `../../projects/${projectId}/audio`)
  const ext      = path.extname(originalName).toLowerCase() || '.mp3'
  const dest     = path.join(audioDir, `narration${ext}`)
  const urlPath  = `/projects/${projectId}/audio/narration${ext}`

  try {
    fs.mkdirSync(audioDir, { recursive: true })
    fs.writeFileSync(dest, req.body)
    const stats = fs.statSync(dest)
    res.json({ success: true, path: urlPath, filename: `narration${ext}`, size: stats.size, savedAt: dest })
  } catch (err) {
    console.error('[audio] upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /info?projectId=xxx ───────────────────────────────────────────────────
router.get('/info', (req, res) => {
  const { projectId } = req.query
  if (!projectId) return res.status(400).json({ error: 'projectId required' })

  const audioDir = path.resolve(__dirname, `../../projects/${projectId}/audio`)
  const exts     = ['.mp3', '.wav', '.m4a', '.aac']
  let found      = null

  for (const ext of exts) {
    const p = path.join(audioDir, `narration${ext}`)
    if (fs.existsSync(p)) {
      const stats = fs.statSync(p)
      found = { path: `/projects/${projectId}/audio/narration${ext}`, size: stats.size, ext }
      break
    }
  }

  res.json({ exists: !!found, ...(found || {}) })
})

// ── GET /status — audio system availability ───────────────────────────────────
router.get('/status', (req, res) => {
  const ambientFiles = listAmbientFiles()
  const musicIndex   = loadMusicIndex()

  if (!fs.existsSync(STINGS_DIR)) fs.mkdirSync(STINGS_DIR, { recursive: true })

  const stingStatus = Object.entries(transitionStings).map(([key, sting]) => ({
    key,
    ...sting,
    available: fs.existsSync(path.join(STINGS_DIR, sting.filename)),
  }))

  res.json({
    pixabayConnected:    !!process.env.PIXABAY_API_KEY,
    pixabayKeySet:       !!process.env.PIXABAY_API_KEY,
    ambientAvailable:    ambientFiles.filter(f => f.available).length,
    ambientTotal:        ambientFiles.length,
    ambientDetails:      ambientFiles,
    cachedMusicTracks:   Object.keys(musicIndex).length,
    musicIndex,
    volumeLevels:        VOLUME_LEVELS,
    stings:              stingStatus,
    stingsAvailable:     stingStatus.filter(s => s.available).length,
    stingsTotal:         stingStatus.length,
  })
})

// ── POST /build-specs — build complete audio specs for all scenes ─────────────
// ?download=1 fetches music from Pixabay for uncached moods.
// Without the flag, uses only already-cached tracks (instant).
router.post('/build-specs', async (req, res) => {
  const { scenes, projectId } = req.body
  if (!Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: 'scenes array required' })
  }

  try {
    const download = req.query.download === '1'
    const specs    = download
      ? await buildProjectAudioSpecs(scenes)
      : buildProjectAudioSpecsCached(scenes)

    res.json({ success: true, specs })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /search-music — search Pixabay ──────────────────────────────────────
router.post('/search-music', async (req, res) => {
  const { query, mood } = req.body
  if (!query) return res.status(400).json({ error: 'query required' })

  try {
    const tracks = await searchMusic(query, mood || 'neutral')
    res.json(tracks)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /download-music — download and cache a track for a mood ──────────────
router.post('/download-music', async (req, res) => {
  const { mood, query } = req.body
  if (!mood) return res.status(400).json({ error: 'mood required' })

  const { moodMap } = require('../config/musicMoods')
  const moodConfig  = moodMap[mood] || moodMap.neutral
  const searchQuery = query || moodConfig.musicQuery

  try {
    const filePath = await getMusicForMood(mood, searchQuery)
    res.json({ success: true, filePath, url: filePath ? `/library/music/${require('path').basename(filePath)}` : null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /ambient-list — list all ambient files and their availability ─────────
router.get('/ambient-list', (req, res) => {
  res.json(listAmbientFiles())
})

module.exports = router
