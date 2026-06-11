const { generateMusic, normaliseMood }    = require('./elevenLabsAudio')
const { getSting, getAmbient, getOverlaySound } = require('./elevenLabsSound')

const CATEGORY_MAP = {
  finance:        'trading_floor',
  tech:           'data_center_hum',
  politics:       'government_hall',
  legal:          'courtroom_silence',
  industry:       'factory_floor',
  cities:         'city_traffic',
  media:          'press_room',
  energy:         'factory_floor',
  transportation: 'airport_ambient',
  social:         'crowd_murmur',
  business:       'office_ambient',
  default:        'soft_ambient',
}

const MOOD_TO_STING = {
  tense:         'low_drone',
  triumphant:    'rise_sting',
  somber:        'soft_fade',
  neutral:       'neutral_sting',
  dramatic:      'impact_sting',
  reflective:    'soft_fade',
  anticipatory:  'rise_sting',
  institutional: 'neutral_sting',
}

function inferCategory(scene) {
  const text = ((scene.script_excerpt || '') + ' ' + (scene.subject_anchors || []).join(' ')).toLowerCase()
  if (['stock','market','wall street','trading','finance','bank','billion','trillion'].some(w => text.includes(w))) return 'finance'
  if (['apple','google','microsoft','tech','software','startup','silicon','iphone'].some(w => text.includes(w))) return 'tech'
  if (['congress','senate','government','president','policy','white house'].some(w => text.includes(w))) return 'politics'
  if (['court','judge','trial','legal','law','attorney'].some(w => text.includes(w))) return 'legal'
  if (['factory','manufactur','industrial','worker','assembly'].some(w => text.includes(w))) return 'industry'
  if (['city','street','urban','downtown','skyline'].some(w => text.includes(w))) return 'cities'
  if (['press','media','journalist','conference','reporter'].some(w => text.includes(w))) return 'media'
  if (['airport','flight','airline','travel'].some(w => text.includes(w))) return 'transportation'
  if (['crowd','protest','rally','people','public'].some(w => text.includes(w))) return 'social'
  if (['business','company','corporate','ceo','executive','office'].some(w => text.includes(w))) return 'business'
  return 'default'
}

const VOLUME = { narration: 1.0, music: 0.12, ambient: 0.06, sting: 0.45 }

async function buildProjectAudioSpecs(scenes) {
  // Step 1 — Pre-generate music for all unique moods
  console.log('[mixer] pre-generating music...')
  const uniqueMoods = [...new Set(scenes.map(s => normaliseMood(s.mood || 'neutral')))]
  const musicCache  = {}
  for (const mood of uniqueMoods) {
    try { musicCache[mood] = await generateMusic(mood); console.log(`[mixer] music ready: ${mood}`) }
    catch (err) { console.warn(`[mixer] music failed ${mood}:`, err.message) }
  }
  if (!musicCache['neutral']) {
    try { musicCache['neutral'] = await generateMusic('neutral') } catch {}
  }

  // Step 2 — Pre-generate ambient for all unique categories
  console.log('[mixer] pre-generating ambient...')
  const uniqueAmbientKeys = [...new Set(scenes.map(s => {
    const cat = s.category || inferCategory(s)
    return CATEGORY_MAP[cat] || CATEGORY_MAP.default
  }))]
  const ambientCache = {}
  for (const ambientKey of uniqueAmbientKeys) {
    try { ambientCache[ambientKey] = await getAmbient(ambientKey); console.log(`[mixer] ambient ready: ${ambientKey}`) }
    catch (err) { console.warn(`[mixer] ambient failed ${ambientKey}:`, err.message) }
  }

  // Step 3 — Build spec per scene
  console.log('[mixer] building specs for', scenes.length, 'scenes...')
  const specs = []

  for (const scene of scenes) {
    const normMood   = normaliseMood(scene.mood || 'neutral')
    const category   = scene.category || inferCategory(scene)
    const ambientKey = CATEGORY_MAP[category] || CATEGORY_MAP.default

    const spec = {
      scene_id:       scene.scene_id,
      narration:      scene.audio_path ? { url: scene.audio_path, volume: VOLUME.narration } : null,
      music:          null,
      ambient:        null,
      sting:          null,
      overlay_sounds: [],
    }

    const music = musicCache[normMood] || musicCache['neutral']
    if (music) spec.music = { url: music.url, volume: VOLUME.music, loop: true }

    const ambient = ambientCache[ambientKey]
    if (ambient) spec.ambient = { url: ambient.url, volume: VOLUME.ambient, loop: true }

    if (scene.use_sting !== false) {
      const stingKey = MOOD_TO_STING[normMood] || 'neutral_sting'
      try {
        const sting = await getSting(stingKey)
        if (sting) spec.sting = { url: sting.url, volume: VOLUME.sting }
      } catch (err) { console.warn(`[mixer] sting failed:`, err.message) }
    }

    if (scene.overlays?.length) {
      for (const overlay of scene.overlays.filter(o => o.status === 'accepted')) {
        const animEnter = overlay.animation?.enter || 'fade'
        try {
          const sound = await getOverlaySound(overlay.type, animEnter)
          if (sound) {
            spec.overlay_sounds.push({
              overlay_id: overlay.id,
              url:        sound.url,
              volume:     sound.volume || 0.30,
              appear_at:  overlay.timing?.appearAt || 0.7,
            })
          }
        } catch {}
      }
    }

    specs.push(spec)
    console.log(`[mixer] scene ${scene.scene_id}: narration=${!!spec.narration} music=${!!spec.music} ambient=${!!spec.ambient} sting=${!!spec.sting} overlay_sounds=${spec.overlay_sounds.length}`)
    if (spec.narration) console.log(`  narration url: ${spec.narration.url}`)
  }

  console.log(`[mixer] complete — ${specs.filter(s => s.music).length}/${specs.length} music, ${specs.filter(s => s.ambient).length}/${specs.length} ambient`)
  return specs
}

// Instant cached build for render — no API calls
function buildProjectAudioSpecsCached(scenes) {
  const { loadMusicIndex } = require('./elevenLabsAudio')
  const path = require('path')
  const fs   = require('fs')
  const MUSIC_DIR = path.resolve(__dirname, '../../library/music')
  const index = loadMusicIndex()

  return scenes.map(scene => {
    const normMood = normaliseMood(scene.mood || 'neutral')
    const cacheKey = `music_${normMood}`
    const entry    = index[cacheKey]
    const mFile    = entry?.filename ? path.join(MUSIC_DIR, entry.filename) : null
    const mExists  = mFile && fs.existsSync(mFile)

    return {
      scene_id:       scene.scene_id,
      narration:      scene.audio_path ? { url: scene.audio_path, volume: VOLUME.narration } : null,
      music:          mExists ? { url: entry.url, volume: VOLUME.music, loop: true } : null,
      ambient:        null,
      sting:          null,
      overlay_sounds: [],
    }
  })
}

module.exports = { buildProjectAudioSpecs, buildProjectAudioSpecsCached, VOLUME }
