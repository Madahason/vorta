const router = require('express').Router()
const path   = require('path')
const fs     = require('fs')

const { buildProjectAudioSpecsCached }              = require('../services/audioMixer')
const { searchMusic, getMusicForMood, loadMusicIndex } = require('../services/pixabayMusic')
const { listAmbientFiles, AMBIENT_CATALOG, AMBIENT_DIR } = require('../services/ambientLibrary')
const transitionStings                              = require('../config/transitionStings')

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
    stings:              stingStatus,
    stingsAvailable:     stingStatus.filter(s => s.available).length,
    stingsTotal:         stingStatus.length,
  })
})

// ── GET /test-pixabay — debug endpoint to verify Pixabay API connection ───────
router.get('/test-pixabay', async (req, res) => {
  try {
    const key = process.env.PIXABAY_API_KEY
    if (!key) return res.json({ error: 'PIXABAY_API_KEY not set in .env' })

    const url  = `https://pixabay.com/api/music/?key=${key}&q=cinematic&per_page=3`
    const response = await fetch(url)
    const data = await response.json()

    res.json({
      status:     response.status,
      hits:       data.hits?.length || 0,
      firstTrack: data.hits?.[0] || null,
      totalHits:  data.totalHits,
    })
  } catch (err) {
    res.json({ error: err.message })
  }
})

// ── POST /build-specs — build complete audio specs for all scenes ─────────────
// Uses cached music tracks + Claude-selected ambient (if ambientSelector available)
router.post('/build-specs', async (req, res) => {
  const { scenes, projectId } = req.body
  if (!Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: 'scenes array required' })
  }

  try {
    const { moodMap }          = require('../config/musicMoods')
    const download             = req.query.download === '1'
    const { VOLUME_LEVELS }    = require('../services/audioMixer')
    const getMoodConfig        = (mood) => moodMap[mood] || moodMap.neutral

    // Collect unique moods and download/cache music for each
    const uniqueMoods  = [...new Set(scenes.map(s => s.mood || 'neutral'))]
    const musicByMood  = {}

    await Promise.allSettled(uniqueMoods.map(async mood => {
      const moodConfig  = getMoodConfig(mood)
      try {
        musicByMood[mood] = await getMusicForMood(mood, moodConfig.musicQuery)
      } catch (err) {
        console.warn(`[audio] music for "${mood}" failed:`, err.message)
      }
    }))

    // Try to load ambient selector (may fail if Anthropic key not set)
    let selectAmbient = null
    if (download) {
      try {
        selectAmbient = require('../services/ambientSelector').selectAmbientForScene
      } catch { /* ambient selector optional */ }
    }

    const specs = await Promise.all(scenes.map(async (scene) => {
      const mood       = scene.mood || 'neutral'
      const moodConfig = getMoodConfig(mood)

      const spec = {
        scene_id:  scene.scene_id,
        narration: scene.audio_path
          ? { path: scene.audio_path, url: scene.audio_path, volume: VOLUME_LEVELS.narration }
          : null,
        music:   null,
        ambient: null,
        sting:   null,
      }

      // Music
      const musicPath = musicByMood[mood]
      if (musicPath) {
        spec.music = {
          path:     musicPath,
          url:      `/library/music/${path.basename(musicPath)}`,
          volume:   VOLUME_LEVELS.music,
          loop:     true,
          filename: path.basename(musicPath),
        }
      }

      // Ambient — use Claude selector when downloading, otherwise mood-based
      try {
        let ambientKey
        if (selectAmbient) {
          ambientKey = await selectAmbient(scene)
        } else {
          const { getAmbientForMood, getAmbientForCategory } = require('../services/ambientLibrary')
          const ambient = getAmbientForCategory(scene.category) || getAmbientForMood(mood)
          if (ambient) {
            spec.ambient = {
              path:     ambient.filePath,
              url:      ambient.url,
              volume:   VOLUME_LEVELS.ambient,
              loop:     true,
              filename: ambient.filename,
              description: ambient.description,
            }
          }
          ambientKey = null
        }

        if (ambientKey) {
          const ambient = AMBIENT_CATALOG[ambientKey]
          if (ambient) {
            const ambientPath = path.join(AMBIENT_DIR, ambient.filename)
            if (fs.existsSync(ambientPath)) {
              spec.ambient = {
                path:        ambientPath,
                url:         `/library/ambient/${ambient.filename}`,
                volume:      VOLUME_LEVELS.ambient,
                loop:        true,
                filename:    ambient.filename,
                description: ambient.description,
                key:         ambientKey,
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[audio] ambient for scene ${scene.scene_id} failed:`, err.message)
      }

      // Sting
      const stingKey = moodConfig.transitionSting || 'neutral_sting'
      const stingDef = transitionStings[stingKey]
      if (stingDef) {
        const stingPath = path.join(STINGS_DIR, stingDef.filename)
        if (fs.existsSync(stingPath)) {
          spec.sting = {
            path:     stingPath,
            url:      `/library/stings/${stingDef.filename}`,
            volume:   VOLUME_LEVELS.sting,
            filename: stingDef.filename,
            duration: stingDef.duration,
          }
        }
      }

      return spec
    }))

    res.json({ success: true, specs })
  } catch (err) {
    console.error('[audio] build-specs error:', err)
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

  const { moodMap }  = require('../config/musicMoods')
  const moodCfg      = (m) => moodMap[m] || moodMap.neutral
  const moodConfig   = moodCfg(mood)
  const searchQuery  = query || moodConfig.musicQuery

  try {
    const filePath = await getMusicForMood(mood, searchQuery)
    res.json({ success: true, filePath, url: filePath ? `/library/music/${require('path').basename(filePath)}` : null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /download-ambient — download all missing ambient files via yt-dlp ───
router.post('/download-ambient', async (req, res) => {
  const { downloadAmbientFile } = require('../services/ambientLibrary')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders()

  const sendEvent = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch {}
  }

  const keys = Object.keys(AMBIENT_CATALOG)

  for (const key of keys) {
    const filePath = path.join(AMBIENT_DIR, AMBIENT_CATALOG[key].filename)
    if (fs.existsSync(filePath)) {
      sendEvent({ type: 'skipped', key, message: `${key} already exists` })
      continue
    }
    sendEvent({ type: 'downloading', key, message: `Downloading ${key}…` })
    try {
      await downloadAmbientFile(key)
      sendEvent({ type: 'done', key })
    } catch (err) {
      sendEvent({ type: 'error', key, message: err.message })
    }
  }

  sendEvent({ type: 'complete' })
  res.end()
})

// ── POST /download-ambient/:key — download single ambient file ────────────────
router.post('/download-ambient/:key', async (req, res) => {
  try {
    const { downloadAmbientFile } = require('../services/ambientLibrary')
    await downloadAmbientFile(req.params.key)
    res.json({ success: true, key: req.params.key })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /ambient-list — list all ambient files and their availability ─────────
router.get('/ambient-list', (req, res) => {
  res.json(listAmbientFiles())
})

module.exports = router
