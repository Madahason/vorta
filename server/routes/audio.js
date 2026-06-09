const router = require('express').Router()
const path   = require('path')
const fs     = require('fs')

const { buildProjectAudioSpecs, buildProjectAudioSpecsCached } = require('../services/audioMixer')
const { generateMusic, generateAmbient, normaliseMood,
        loadMusicIndex, loadAmbientIndex, MUSIC_PROMPTS }      = require('../services/elevenLabsAudio')
const { getLibraryStats }                                      = require('../services/soundLibrary')

const MUSIC_MOODS = Object.keys(MUSIC_PROMPTS)

// ── POST /upload?projectId=xxx ────────────────────────────────────────────────
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
      found = { path: `/projects/${projectId}/audio/narration${ext}`, size: fs.statSync(p).size, ext }
      break
    }
  }
  res.json({ exists: !!found, ...(found || {}) })
})

// ── GET /status ───────────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  const musicIndex   = loadMusicIndex()
  const ambientIndex = loadAmbientIndex()
  const soundStats   = getLibraryStats()

  res.json({
    elevenlabsConnected:  !!process.env.ELEVENLABS_API_KEY,
    musicSource:          'ElevenLabs AI',
    ambientSource:        'ElevenLabs AI',
    stingSource:          'ElevenLabs AI',
    cachedMusicTracks:    Object.keys(musicIndex).length,
    cachedAmbientTracks:  Object.keys(ambientIndex).length,
    musicIndex,
    ambientIndex,
    soundLibrary:         soundStats,
  })
})

// ── POST /generate-music ──────────────────────────────────────────────────────
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

// ── POST /generate-ambient ────────────────────────────────────────────────────
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

// ── POST /build-specs ─────────────────────────────────────────────────────────
router.post('/build-specs', async (req, res) => {
  const { scenes } = req.body
  if (!Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: 'scenes array required' })
  }
  try {
    const specs = await buildProjectAudioSpecs(scenes)
    console.log(`[audio] build-specs — ${specs.filter(s => s.music).length}/${specs.length} music, ${specs.filter(s => s.ambient).length}/${specs.length} ambient`)
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

// ── GET /diagnose ─────────────────────────────────────────────────────────────
router.get('/diagnose', (req, res) => {
  const musicIndex   = loadMusicIndex()
  const ambientIndex = loadAmbientIndex()

  const dirs = {
    music:          path.resolve(__dirname, '../../library/music'),
    ambient:        path.resolve(__dirname, '../../library/ambient'),
    stings:         path.resolve(__dirname, '../../library/stings'),
    'overlay-sounds': path.resolve(__dirname, '../../library/overlay-sounds'),
  }

  const directories = {}
  for (const [name, dir] of Object.entries(dirs)) {
    const exists = fs.existsSync(dir)
    const files  = exists ? fs.readdirSync(dir).filter(f => f.endsWith('.mp3')) : []
    directories[name] = { exists, fileCount: files.length, files }
  }

  res.json({
    env: { ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY },
    directories,
    musicIndex,
    ambientIndex,
    cachedMusicTracks:  Object.keys(musicIndex).length,
    cachedAmbientTracks: Object.keys(ambientIndex).length,
  })
})

module.exports = router
