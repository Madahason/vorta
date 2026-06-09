const path = require('path')
const fs   = require('fs')

const transitionStings = require('../config/transitionStings')

const AMBIENT_DIR = path.resolve(__dirname, '../../library/ambient')
const STINGS_DIR  = path.resolve(__dirname, '../../library/stings')
const MUSIC_DIR   = path.resolve(__dirname, '../../library/music')

const VOLUME_LEVELS = {
  narration: 1.0,
  music:     0.12,
  ambient:   0.06,
  sting:     0.45,
}

async function buildSceneAudioSpec(scene) {
  const { getMusicForMood, normaliseMood, loadMusicIndex } = require('./musicService')
  const { moodMap }  = require('../config/musicMoods')

  const mood     = scene.mood || 'neutral'
  const normMood = normaliseMood(mood)
  const moodCfg  = moodMap[normMood] || moodMap.neutral

  const spec = {
    scene_id:  scene.scene_id,
    narration: scene.audio_path ? { path: scene.audio_path, url: scene.audio_path, volume: VOLUME_LEVELS.narration } : null,
    music:     null,
    ambient:   null,
    sting:     null,
  }

  // Music
  try {
    const music   = await getMusicForMood(mood)
    spec.music    = { path: music.path, url: music.url, volume: VOLUME_LEVELS.music, loop: true, filename: path.basename(music.path) }
  } catch (err) {
    console.warn(`[mixer] music failed for scene ${scene.scene_id}:`, err.message)
  }

  // Ambient — Claude selector when available, mood-based fallback
  try {
    let ambientKey = null
    try {
      const { selectAmbientForScene } = require('./ambientSelector')
      ambientKey = await selectAmbientForScene(scene)
    } catch {
      const { getAmbientForCategory, getAmbientForMood } = require('./ambientLibrary')
      const ambient = getAmbientForCategory(scene.category) || getAmbientForMood(mood)
      if (ambient) {
        spec.ambient = { path: ambient.filePath, url: ambient.url, volume: VOLUME_LEVELS.ambient, loop: true, filename: ambient.filename }
      }
    }

    if (ambientKey) {
      const { AMBIENT_CATALOG } = require('./ambientLibrary')
      const ambient     = AMBIENT_CATALOG[ambientKey]
      if (ambient) {
        const ambientPath = path.join(AMBIENT_DIR, ambient.filename)
        if (!fs.existsSync(ambientPath)) {
          try {
            const { downloadAmbientFile } = require('./freesoundService')
            await downloadAmbientFile(ambientKey)
          } catch (dlErr) {
            console.warn(`[mixer] ambient download failed for ${ambientKey}:`, dlErr.message)
          }
        }
        if (fs.existsSync(ambientPath)) {
          spec.ambient = {
            path:     ambientPath,
            url:      `/library/ambient/${ambient.filename}`,
            volume:   VOLUME_LEVELS.ambient,
            loop:     true,
            key:      ambientKey,
            filename: ambient.filename,
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[mixer] ambient failed for scene ${scene.scene_id}:`, err.message)
  }

  // Sting
  try {
    const stingKey = moodCfg.transitionSting || 'neutral_sting'
    const sting    = transitionStings[stingKey]
    if (sting) {
      const stingPath = path.join(STINGS_DIR, sting.filename)
      if (fs.existsSync(stingPath)) {
        spec.sting = {
          path:     stingPath,
          url:      `/library/stings/${sting.filename}`,
          volume:   VOLUME_LEVELS.sting,
          filename: sting.filename,
          duration: sting.duration,
        }
      }
    }
  } catch (err) {
    console.warn(`[mixer] sting failed for scene ${scene.scene_id}:`, err.message)
  }

  return spec
}

async function buildProjectAudioSpecs(scenes) {
  const specs = []
  for (const scene of scenes) {
    specs.push(await buildSceneAudioSpec(scene))
  }
  return specs
}

// Instant cached build — no API calls, uses only what's on disk
function buildProjectAudioSpecsCached(scenes) {
  const { loadMusicIndex } = require('./musicService')
  const index = loadMusicIndex()

  return scenes.map(scene => {
    const mood    = scene.mood || 'neutral'
    const entry   = index[mood]
    const mFile   = entry?.filename ? path.join(MUSIC_DIR, entry.filename) : null
    const mExists = mFile && fs.existsSync(mFile)

    return {
      scene_id:  scene.scene_id,
      narration: scene.audio_path ? { path: scene.audio_path, url: scene.audio_path, volume: VOLUME_LEVELS.narration } : null,
      music:     mExists ? { path: mFile, url: `/library/music/${path.basename(mFile)}`, volume: VOLUME_LEVELS.music, loop: true, filename: path.basename(mFile) } : null,
      ambient:   null,
      sting:     null,
    }
  })
}

module.exports = { buildSceneAudioSpec, buildProjectAudioSpecs, buildProjectAudioSpecsCached, VOLUME_LEVELS }
