const path = require('path')
const fs   = require('fs')
const { moodMap, categoryAmbientMap } = require('../config/musicMoods')
const transitionStings                = require('../config/transitionStings')
const { getAmbientForCategory, getAmbientForMood } = require('./ambientLibrary')
const { getMusicForMood, getCachedTrackForMood }   = require('./freeMusicArchive')

const STINGS_DIR = path.resolve(__dirname, '../../library/stings')

const VOLUME_LEVELS = {
  narration: 1.0,
  music:     0.12,
  ambient:   0.06,
  sting:     0.45,
}

function getMoodConfig(mood) {
  if (moodMap[mood]) return moodMap[mood]

  // Fuzzy fallback for unknown mood names Claude might generate
  const m = (mood || '').toLowerCase()
  const tenseWords   = ['tense', 'dark', 'conflict', 'threat', 'danger', 'crisis', 'fear', 'confrontat', 'ominous', 'restrict', 'gravity', 'urgent', 'suspens']
  const triumphWords = ['triumph', 'celebrat', 'success', 'win', 'achiev', 'inspir', 'hope', 'uplift']
  const somberWords  = ['somber', 'sad', 'grief', 'loss', 'fail', 'melanchol', 'mourn']
  const dramaticWords= ['dramatic', 'intense', 'reveal', 'revelation', 'impact', 'revelat']

  if (tenseWords.some(w => m.includes(w)))    return moodMap.tense
  if (triumphWords.some(w => m.includes(w)))  return moodMap.triumphant
  if (somberWords.some(w => m.includes(w)))   return moodMap.somber
  if (dramaticWords.some(w => m.includes(w))) return moodMap.dramatic

  console.warn(`[audioMixer] unknown mood "${mood}" — falling back to neutral`)
  return moodMap.neutral
}

function buildSceneSpec(scene, musicPath) {
  const mood       = scene.mood || 'neutral'
  const moodConfig = getMoodConfig(mood)

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
    const moodConfig = getMoodConfig(mood)
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
