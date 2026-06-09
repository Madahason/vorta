const path = require('path')
const fs   = require('fs')

const transitionStings = require('../config/transitionStings')

const STINGS_DIR  = path.resolve(__dirname, '../../library/stings')
const MUSIC_DIR   = path.resolve(__dirname, '../../library/music')

const VOLUME_LEVELS = {
  narration: 1.0,
  music:     0.12,
  ambient:   0.06,
  sting:     0.45,
}

async function buildSceneAudioSpec(scene) {
  const { generateMusic, normaliseMood }   = require('./elevenLabsAudio')
  const { selectAndGenerateAmbient }       = require('./ambientSelector')
  const { moodMap }                        = require('../config/musicMoods')

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

  // Music — ElevenLabs AI, cached per mood
  try {
    const music = await generateMusic(normMood)
    spec.music  = { path: music.path, url: music.url, volume: VOLUME_LEVELS.music, loop: true, filename: path.basename(music.path) }
  } catch (err) {
    console.warn(`[mixer] music failed for scene ${scene.scene_id}:`, err.message)
  }

  // Ambient — ElevenLabs AI, cached per category+mood
  try {
    const ambient = await selectAndGenerateAmbient(scene)
    if (ambient) {
      spec.ambient = { path: ambient.path, url: ambient.url, volume: VOLUME_LEVELS.ambient, loop: true, filename: path.basename(ambient.path) }
    }
  } catch (err) {
    console.warn(`[mixer] ambient failed for scene ${scene.scene_id}:`, err.message)
  }

  // Sting — Freesound CC0, from pre-downloaded cache
  try {
    const stingKey  = moodCfg.transitionSting || 'neutral_sting'
    const sting     = transitionStings[stingKey]
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

// Instant cached build for render — no API calls, uses only what's on disk
function buildProjectAudioSpecsCached(scenes) {
  const { loadMusicIndex, normaliseMood } = require('./elevenLabsAudio')
  const index = loadMusicIndex()

  return scenes.map(scene => {
    const normMood = normaliseMood(scene.mood || 'neutral')
    const cacheKey = `music_${normMood}`
    const entry    = index[cacheKey]
    const mFile    = entry?.filename ? path.join(MUSIC_DIR, entry.filename) : null
    const mExists  = mFile && fs.existsSync(mFile)

    return {
      scene_id:  scene.scene_id,
      narration: scene.audio_path ? { path: scene.audio_path, url: scene.audio_path, volume: VOLUME_LEVELS.narration } : null,
      music:     mExists ? { path: mFile, url: entry.url, volume: VOLUME_LEVELS.music, loop: true, filename: path.basename(mFile) } : null,
      ambient:   null,
      sting:     null,
    }
  })
}

module.exports = { buildSceneAudioSpec, buildProjectAudioSpecs, buildProjectAudioSpecsCached, VOLUME_LEVELS }
