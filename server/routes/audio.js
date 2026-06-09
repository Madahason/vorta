const router = require('express').Router()
const path   = require('path')
const fs     = require('fs')

const { buildProjectAudioSpecsCached }                   = require('../services/audioMixer')
const { getMusicForMood, loadMusicIndex }                = require('../services/musicService')
const { listAmbientFiles, AMBIENT_CATALOG, AMBIENT_DIR } = require('../services/ambientLibrary')
const { downloadSting }                                  = require('../services/freesoundService')
const transitionStings                                   = require('../config/transitionStings')

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
    freesoundConnected:  !!process.env.FREESOUND_API_KEY,
    freesoundKeySet:     !!process.env.FREESOUND_API_KEY,
    fmaRemoved:          true,
    musicSource:         'Freesound',
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

// ── POST /build-specs — build complete audio specs for all scenes ─────────────
router.post('/build-specs', async (req, res) => {
  const { scenes } = req.body
  if (!Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: 'scenes array required' })
  }

  try {
    const { moodMap }       = require('../config/musicMoods')
    const { VOLUME_LEVELS } = require('../services/audioMixer')
    const getMoodConfig     = (mood) => moodMap[mood] || moodMap.neutral

    const uniqueMoods  = [...new Set(scenes.map(s => s.mood || 'neutral'))]
    const musicByMood  = {}

    await Promise.allSettled(uniqueMoods.map(async mood => {
      try {
        musicByMood[mood] = await getMusicForMood(mood)   // returns { path, url }
      } catch (err) {
        console.warn(`[audio] music for "${mood}" failed:`, err.message)
      }
    }))

    let selectAmbient = null
    try {
      selectAmbient = require('../services/ambientSelector').selectAmbientForScene
    } catch { /* ambient selector optional */ }

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

      const musicResult = musicByMood[mood]
      if (musicResult) {
        spec.music = {
          path:     musicResult.path,
          url:      musicResult.url,
          volume:   VOLUME_LEVELS.music,
          loop:     true,
          filename: path.basename(musicResult.path),
        }
      }

      try {
        let ambientKey
        if (selectAmbient) {
          ambientKey = await selectAmbient(scene)
        } else {
          const { getAmbientForMood, getAmbientForCategory } = require('../services/ambientLibrary')
          const ambient = getAmbientForCategory(scene.category) || getAmbientForMood(mood)
          if (ambient) {
            spec.ambient = {
              path:        ambient.filePath,
              url:         ambient.url,
              volume:      VOLUME_LEVELS.ambient,
              loop:        true,
              filename:    ambient.filename,
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

// ── POST /download-music — download and cache a track for a mood ──────────────
router.post('/download-music', async (req, res) => {
  const { mood } = req.body
  if (!mood) return res.status(400).json({ error: 'mood required' })

  try {
    const result = await getMusicForMood(mood)   // { path, url }
    res.json({ success: true, path: result.path, url: result.url, mood })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /download-ambient — download all missing ambient files ───────────────
router.post('/download-ambient', async (req, res) => {
  const { downloadAmbientFile } = require('../services/freesoundService')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders()

  const sendEvent = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch {}
  }

  for (const key of Object.keys(AMBIENT_CATALOG)) {
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
    const { downloadAmbientFile } = require('../services/freesoundService')
    await downloadAmbientFile(req.params.key)
    res.json({ success: true, key: req.params.key })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
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

// ── GET /ambient-list — list all ambient files and their availability ─────────
router.get('/ambient-list', (req, res) => {
  res.json(listAmbientFiles())
})

// ── GET /diagnose — full system diagnostic ────────────────────────────────────
router.get('/diagnose', async (req, res) => {
  const https    = require('https')
  const { exec } = require('child_process')
  const { promisify } = require('util')
  const execAsync = promisify(exec)
  const results  = {}

  // 1. Environment variables
  results.env = {
    FREESOUND_API_KEY:  !!process.env.FREESOUND_API_KEY,
    ANTHROPIC_API_KEY:  !!process.env.ANTHROPIC_API_KEY,
    ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
  }

  // 2. Library directories
  const dirs = {
    music:   path.resolve(__dirname, '../../library/music'),
    ambient: path.resolve(__dirname, '../../library/ambient'),
    stings:  path.resolve(__dirname, '../../library/stings'),
  }
  results.directories = {}
  for (const [name, dir] of Object.entries(dirs)) {
    const exists = fs.existsSync(dir)
    const files  = exists ? fs.readdirSync(dir).filter(f => f.endsWith('.mp3')) : []
    results.directories[name] = { exists, fileCount: files.length, files }
  }

  // 3. yt-dlp
  try {
    const { stdout } = await execAsync('yt-dlp --version', { timeout: 10_000 })
    results.ytdlp = { installed: true, version: stdout.trim() }
  } catch (err) {
    results.ytdlp = { installed: false, error: err.message }
  }

  // 4. Freesound API
  if (process.env.FREESOUND_API_KEY) {
    await new Promise((resolve) => {
      const url = 'https://freesound.org/apiv2/search/text/?query=ambient&page_size=1&fields=id,name'
      https.get(url, { headers: { Authorization: `Token ${process.env.FREESOUND_API_KEY}`, Accept: 'application/json' } }, (res2) => {
        let data = ''
        res2.on('data', c => data += c)
        res2.on('end', () => {
          results.freesound = { status: res2.statusCode, isJSON: data.trim().startsWith('{'), preview: data.slice(0, 200) }
          resolve()
        })
      }).on('error', err => { results.freesound = { error: err.message }; resolve() })
    })
  } else {
    results.freesound = { error: 'FREESOUND_API_KEY not set' }
  }

  // 5. YouTube Audio Library search
  try {
    const { stdout } = await execAsync(
      'yt-dlp "ytsearch1:cinematic documentary background music" --print "%(title)s" --no-download --flat-playlist',
      { timeout: 30_000 }
    )
    results.youtubeSearch = { working: true, result: stdout.trim().slice(0, 100) }
  } catch (err) {
    results.youtubeSearch = { working: false, error: err.message }
  }

  // 6. musicIndex.json
  const indexPath = path.resolve(__dirname, '../../library/musicIndex.json')
  results.musicIndex = fs.existsSync(indexPath)
    ? JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    : 'not found'

  res.json(results)
})

module.exports = router
