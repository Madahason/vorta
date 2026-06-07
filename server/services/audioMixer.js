const path = require('path')
const fs   = require('fs')
const { moodMap, categoryAmbientMap } = require('../config/musicMoods')
const transitionStings                = require('../config/transitionStings')
const { getAmbientForCategory, getAmbientForMood } = require('./ambientLibrary')
const { getMusicForMood, getCachedTrackForMood }   = require('./pixabayMusic')

const STINGS_DIR = path.resolve(__dirname, '../../library/stings')

const VOLUME_LEVELS = {
  narration: 1.0,
  music:     0.12,
  ambient:   0.06,
  sting:     0.45,
}

function buildSceneSpec(scene, musicPath) {
  const mood       = scene.mood || 'neutral'
  const moodConfig = moodMap[mood] || moodMap.neutral

  const spec = {
    scene_id:  scene.scene_id,
    narration: scene.audio_path
      ? { path: scene.audio_path, volume: VOLUME_LEVELS.narration }
      : null,
    music:   null,
    ambient: null,
    sting:   null,
  }

  if (musicPath) {
    spec.music = {
      path:     musicPath,
      volume:   VOLUME_LEVELS.music,
      loop:     true,
      url:      `/library/music/${path.basename(musicPath)}`,
      filename: path.basename(musicPath),
    }
  }

  const ambient = getAmbientForCategory(scene.category) || getAmbientForMood(mood)
  if (ambient) {
    spec.ambient = {
      path:     ambient.filePath,
      volume:   VOLUME_LEVELS.ambient,
      loop:     true,
      url:      ambient.url,
      filename: ambient.filename,
    }
  }

  const stingKey  = moodConfig.transitionSting || 'neutral_sting'
  const stingDef  = transitionStings[stingKey]
  if (stingDef) {
    const stingPath = path.join(STINGS_DIR, stingDef.filename)
    if (fs.existsSync(stingPath)) {
      spec.sting = {
        path:     stingPath,
        volume:   VOLUME_LEVELS.sting,
        url:      `/library/stings/${stingDef.filename}`,
        filename: stingDef.filename,
        duration: stingDef.duration,
      }
    }
  }

  return spec
}

// Build audio specs for all scenes.
// Downloads music for unique moods in parallel; ambient/stings use only local files.
async function buildProjectAudioSpecs(scenes) {
  const uniqueMoods = [...new Set(scenes.map(s => s.mood || 'neutral'))]
  const musicByMood = {}

  // Download unique moods in parallel — failures are silently skipped
  await Promise.allSettled(uniqueMoods.map(async mood => {
    const moodConfig = moodMap[mood] || moodMap.neutral
    try {
      musicByMood[mood] = await getMusicForMood(mood, moodConfig.musicQuery)
    } catch (err) {
      console.warn(`[mixer] music for mood "${mood}" failed:`, err.message)
    }
  }))

  return scenes.map(scene => buildSceneSpec(scene, musicByMood[scene.mood || 'neutral'] || null))
}

// Build specs using only already-cached music — instant, no API calls
function buildProjectAudioSpecsCached(scenes) {
  return scenes.map(scene => {
    const mood      = scene.mood || 'neutral'
    const musicPath = getCachedTrackForMood(mood)
    return buildSceneSpec(scene, musicPath)
  })
}

module.exports = { buildProjectAudioSpecs, buildProjectAudioSpecsCached, VOLUME_LEVELS }
