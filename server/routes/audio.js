const router = require('express').Router()
const path   = require('path')
const fs     = require('fs')

const { buildProjectAudioSpecs }                                       = require('../services/audioMixer')
const { generateMusic, generateAmbient, normaliseMood,
        loadMusicIndex, loadAmbientIndex, MUSIC_PROMPTS }              = require('../services/elevenLabsAudio')
const { downloadSting }                                                = require('../services/freesoundService')
const transitionStings                                                 = require('../config/transitionStings')

const STINGS_DIR  = path.resolve(__dirname, '../../library/stings')
const MUSIC_MOODS = Object.keys(MUSIC_PROMPTS)

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
  const musicIndex   = loadMusicIndex()
  const ambientIndex = loadAmbientIndex()

  if (!fs.existsSync(STINGS_DIR)) fs.mkdirSync(STINGS_DIR, { recursive: true })

  const stingStatus = Object.entries(transitionStings).map(([key, sting]) => ({
    key,
    ...sting,
    available: fs.existsSync(path.join(STINGS_DIR, sting.filename)),
  }))

  res.json({
    elevenlabsConnected:   !!process.env.ELEVENLABS_API_KEY,
    freesoundConnected:    !!process.env.FREESOUND_API_KEY,
    musicSource:           'ElevenLabs AI',
    ambientSource:         'ElevenLabs AI',
    stingSource:           'Freesound CC0',
    cachedMusicTracks:     Object.keys(musicIndex).length,
    cachedAmbientTracks:   Object.keys(ambientIndex).length,
    musicIndex,
    ambientIndex,
    stings:                stingStatus,
    stingsAvailable:       stingStatus.filter(s => s.available).length,
    stingsTotal:           stingStatus.length,
  })
})

// ── POST /generate-music — generate and cache music for a mood ────────────────
router.post('/generate-music', async (req, res) => {
  const { mood, customPrompt } = req.body
  if (!mood) return res.status(400).json({ error: 'mood required' })

  try {
    const norm   = normaliseMood(mood)
    const result = await generateMusic(norm, customPrompt || null)
    res.json({ success: true, mood: norm, path: result.path, url: result.url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /generate-ambient — generate ambient for a scene ─────────────────────
router.post('/generate-ambient', async (req, res) => {
  const { sceneDescription, category, mood, cacheKey } = req.body
  if (!category || !mood) return res.status(400).json({ error: 'category and mood required' })

  try {
    const result = await generateAmbient(sceneDescription || '', category, normaliseMood(mood), cacheKey || null)
    res.json({ success: true, url: result.url, path: result.path })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /build-specs — build complete audio specs for all scenes ─────────────
router.post('/build-specs', async (req, res) => {
  const { scenes } = req.body
  if (!Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: 'scenes array required' })
  }

  try {
    // Pre-download stings before generating music/ambient (they're fast and cheap)
    if (!fs.existsSync(STINGS_DIR)) fs.mkdirSync(STINGS_DIR, { recursive: true })
    for (const [key, sting] of Object.entries(transitionStings)) {
      const stingPath = path.join(STINGS_DIR, sting.filename)
      if (!fs.existsSync(stingPath) || fs.statSync(stingPath).size < 1000) {
        try { await downloadSting(key) } catch (err) {
          console.warn(`[audio] sting failed ${key}:`, err.message)
        }
      }
    }

    const specs = await buildProjectAudioSpecs(scenes)

    const withMusic   = specs.filter(s => s.music).length
    const withAmbient = specs.filter(s => s.ambient).length
    console.log(`[audio] build-specs complete — ${withMusic}/${specs.length} music, ${withAmbient}/${specs.length} ambient`)
    res.json({ success: true, specs })
  } catch (err) {
    console.error('[audio] build-specs error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /prewarm-music — SSE stream that generates all 8 mood tracks ──────────
router.get('/prewarm-music', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders()

  const send = (data) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch {} }

  let done = 0
  for (const mood of MUSIC_MOODS) {
    send({ type: 'generating', mood, done, total: MUSIC_MOODS.length })
    try {
      const result = await generateMusic(mood)
      done++
      send({ type: 'done', mood, url: result.url, done, total: MUSIC_MOODS.length })
    } catch (err) {
      done++
      send({ type: 'error', mood, message: err.message, done, total: MUSIC_MOODS.length })
    }
  }

  send({ type: 'complete', total: MUSIC_MOODS.length })
  res.end()
})

// ── POST /download-stings — download all missing sting files via Freesound ────
router.post('/download-stings', async (req, res) => {
  if (!fs.existsSync(STINGS_DIR)) fs.mkdirSync(STINGS_DIR, { recursive: true })

  const results = {}
  for (const key of Object.keys(transitionStings)) {
    const filePath = path.join(STINGS_DIR, transitionStings[key].filename)
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      results[key] = 'downloaded'
      continue
    }
    try {
      await downloadSting(key)
      results[key] = 'downloaded'
    } catch (err) {
      results[key] = `failed: ${err.message}`
    }
  }

  res.json(results)
})

// ── GET /diagnose — full system diagnostic ────────────────────────────────────
router.get('/diagnose', (req, res) => {
  const musicIndex   = loadMusicIndex()
  const ambientIndex = loadAmbientIndex()

  const dirs = {
    music:   path.resolve(__dirname, '../../library/music'),
    ambient: path.resolve(__dirname, '../../library/ambient'),
    stings:  path.resolve(__dirname, '../../library/stings'),
  }

  const directories = {}
  for (const [name, dir] of Object.entries(dirs)) {
    const exists = fs.existsSync(dir)
    const files  = exists ? fs.readdirSync(dir).filter(f => f.endsWith('.mp3')) : []
    directories[name] = { exists, fileCount: files.length, files }
  }

  res.json({
    env: {
      ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
      FREESOUND_API_KEY:  !!process.env.FREESOUND_API_KEY,
    },
    directories,
    musicIndex,
    ambientIndex,
    cachedMusicTracks:   Object.keys(musicIndex).length,
    cachedAmbientTracks: Object.keys(ambientIndex).length,
  })
})

module.exports = router
