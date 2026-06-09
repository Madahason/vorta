const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js')
const fs   = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const {
  addToLibrary, searchLibrary, incrementUsage,
  STINGS_DIR, AMBIENT_DIR, OVERLAY_DIR,
} = require('./soundLibrary')

function getClient() {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set')
  return new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
}

async function generateSound({ prompt, durationSeconds, outputPath, model = 'eleven_text_to_sound_v2', promptInfluence = 0.7 }) {
  const client = getClient()
  console.log(`[elevenlabs-sound] generating: ${prompt.slice(0, 60)}...`)

  const response = await client.textToSoundEffects.convert({
    text:              prompt,
    duration_seconds:  durationSeconds,
    prompt_influence:  promptInfluence,
    model_id:          model,
  })

  const chunks = []
  for await (const chunk of response) chunks.push(chunk)
  const buffer = Buffer.concat(chunks)

  if (buffer.length < 1000) throw new Error(`Generated sound too small: ${buffer.length} bytes`)
  fs.writeFileSync(outputPath, buffer)
  console.log(`[elevenlabs-sound] saved: ${path.basename(outputPath)} (${Math.round(buffer.length / 1024)}KB)`)
  return outputPath
}

async function getSoundDuration(filePath) {
  const { exec } = require('child_process')
  const { promisify } = require('util')
  const execAsync = promisify(exec)
  try {
    const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`)
    return parseFloat(stdout.trim())
  } catch { return null }
}

// ── TRANSITION STINGS ─────────────────────────────────────────────────────────

const STING_DEFINITIONS = {
  low_drone: {
    prompt:   'Deep cinematic low drone bass sting, 2.5 seconds, dark and heavy, suitable for dramatic documentary moments, no melody',
    duration: 3, volume: 0.45, tags: ['dramatic', 'dark', 'heavy'],
  },
  rise_sting: {
    prompt:   'Rising orchestral cinematic sting, 1.8 seconds, triumphant and revealing, suitable for product launches and achievements',
    duration: 2, volume: 0.45, tags: ['triumphant', 'reveal', 'rise'],
  },
  neutral_sting: {
    prompt:   'Subtle neutral cinematic transition whoosh, 1.2 seconds, clean and unobtrusive, documentary chapter transition',
    duration: 2, volume: 0.40, tags: ['neutral', 'transition', 'subtle'],
  },
  impact_sting: {
    prompt:   'Sharp cinematic impact hit, 1 second, dramatic and punchy, suitable for shocking revelations and crisis moments',
    duration: 1.5, volume: 0.50, tags: ['dramatic', 'impact', 'sharp'],
  },
  soft_fade: {
    prompt:   'Soft gentle piano fade sting, 2 seconds, somber and reflective, suitable for sad or contemplative documentary moments',
    duration: 2.5, volume: 0.35, tags: ['somber', 'gentle', 'reflective'],
  },
  whoosh: {
    prompt:   'Fast cinematic whoosh transition sound, 0.8 seconds, energetic and clean, documentary scene transition',
    duration: 1, volume: 0.40, tags: ['energetic', 'fast', 'transition'],
  },
}

async function getSting(stingKey) {
  const existing = searchLibrary('sting', stingKey)
  if (existing) { incrementUsage(existing.id); console.log(`[sting] cache hit: ${stingKey}`); return existing }

  const def = STING_DEFINITIONS[stingKey]
  if (!def) throw new Error(`Unknown sting: ${stingKey}`)

  const filename   = `sting_${stingKey}_${uuidv4()}.mp3`
  const outputPath = path.join(STINGS_DIR, filename)

  await generateSound({ prompt: def.prompt, durationSeconds: def.duration, outputPath, promptInfluence: 0.8 })
  const duration = await getSoundDuration(outputPath)

  return addToLibrary({
    type: 'sting', category: stingKey,
    prompt: def.prompt, filename,
    filePath: outputPath,
    url: `/library/stings/${filename}`,
    duration, volume: def.volume, tags: def.tags,
  })
}

async function generateAllStings(onProgress = null) {
  const results = {}
  for (const key of Object.keys(STING_DEFINITIONS)) {
    if (onProgress) onProgress({ type: 'generating', category: 'sting', key })
    try {
      results[key] = await getSting(key)
      if (onProgress) onProgress({ type: 'done', category: 'sting', key })
    } catch (err) {
      console.warn(`[sting] failed: ${key}:`, err.message)
      if (onProgress) onProgress({ type: 'error', category: 'sting', key, message: err.message })
    }
  }
  return results
}

// ── AMBIENT LOOPS ─────────────────────────────────────────────────────────────

const AMBIENT_DEFINITIONS = {
  trading_floor: {
    prompt:   'Stock exchange trading floor ambient sound, busy crowd noise, ticker sounds, distant shouting, 30 second seamless loop, documentary background',
    duration: 30, tags: ['finance', 'crowd', 'busy'],
  },
  office_ambient: {
    prompt:   'Quiet corporate office ambient sound, subtle keyboard typing, air conditioning hum, distant murmur, 30 second seamless loop',
    duration: 30, tags: ['business', 'quiet', 'indoor'],
  },
  city_traffic: {
    prompt:   'Urban city street ambient sound, traffic noise, distant horns, footsteps, 30 second seamless loop, documentary background',
    duration: 30, tags: ['urban', 'outdoor', 'traffic'],
  },
  data_center_hum: {
    prompt:   'Server room data center ambient sound, constant fan hum, cooling systems, electronic equipment, 30 second seamless loop',
    duration: 30, tags: ['tech', 'indoor', 'mechanical'],
  },
  courtroom_silence: {
    prompt:   'Quiet courtroom interior ambient sound, subtle air conditioning, distant building sounds, formal silence, 30 second seamless loop',
    duration: 30, tags: ['legal', 'quiet', 'formal'],
  },
  factory_floor: {
    prompt:   'Factory manufacturing floor ambient sound, machinery hum, assembly line noise, industrial background, 30 second seamless loop',
    duration: 30, tags: ['industry', 'mechanical', 'loud'],
  },
  crowd_murmur: {
    prompt:   'Indoor crowd murmur ambient sound, many people talking quietly, social gathering background, 30 second seamless loop',
    duration: 30, tags: ['social', 'crowd', 'indoor'],
  },
  government_hall: {
    prompt:   'Large government building interior ambient sound, marble hall echo, distant footsteps, formal atmosphere, 30 second seamless loop',
    duration: 30, tags: ['politics', 'echo', 'formal'],
  },
  tension_drone: {
    prompt:   'Dark cinematic tension drone ambient sound, low ominous hum, subtle dissonance, documentary suspense background, 30 second seamless loop',
    duration: 30, tags: ['dramatic', 'dark', 'tension'],
  },
  soft_ambient: {
    prompt:   'Soft neutral room tone ambient sound, subtle background texture, barely audible, 30 second seamless loop, documentary background',
    duration: 30, tags: ['neutral', 'subtle', 'soft'],
  },
  press_room: {
    prompt:   'Press conference room ambient sound, camera shutter clicks, crowd murmur, anticipatory atmosphere, 30 second seamless loop',
    duration: 30, tags: ['media', 'cameras', 'crowd'],
  },
  airport_ambient: {
    prompt:   'Busy international airport terminal ambient sound, announcements, crowd noise, rolling luggage, 30 second seamless loop',
    duration: 30, tags: ['transportation', 'busy', 'public'],
  },
}

async function getAmbient(category) {
  const existing = searchLibrary('ambient', category)
  if (existing) { incrementUsage(existing.id); console.log(`[ambient] cache hit: ${category}`); return existing }

  const def      = AMBIENT_DEFINITIONS[category] || AMBIENT_DEFINITIONS.soft_ambient
  const filename = `ambient_${category}_${uuidv4()}.mp3`
  const outputPath = path.join(AMBIENT_DIR, filename)

  await generateSound({ prompt: def.prompt, durationSeconds: def.duration, outputPath, promptInfluence: 0.6 })
  const duration = await getSoundDuration(outputPath)

  return addToLibrary({
    type: 'ambient', category,
    prompt: def.prompt, filename,
    filePath: outputPath,
    url: `/library/ambient/${filename}`,
    duration, volume: 0.06, tags: def.tags,
  })
}

async function generateAllAmbient(onProgress = null) {
  const results = {}
  for (const key of Object.keys(AMBIENT_DEFINITIONS)) {
    if (onProgress) onProgress({ type: 'generating', category: 'ambient', key })
    try {
      results[key] = await getAmbient(key)
      if (onProgress) onProgress({ type: 'done', category: 'ambient', key })
    } catch (err) {
      console.warn(`[ambient] failed: ${key}:`, err.message)
      if (onProgress) onProgress({ type: 'error', category: 'ambient', key, message: err.message })
    }
  }
  return results
}

// ── OVERLAY SOUNDS ────────────────────────────────────────────────────────────

const OVERLAY_SOUND_DEFINITIONS = {
  whoosh_soft: {
    prompt:   'Soft subtle cinematic whoosh sound effect, 0.3 seconds, gentle air movement, suitable for lower third slide-in animation',
    duration: 1, volume: 0.30, tags: ['whoosh', 'soft', 'subtle'],
  },
  whoosh_medium: {
    prompt:   'Medium cinematic whoosh sound effect, 0.4 seconds, clean and punchy, suitable for text reveal animations',
    duration: 1, volume: 0.35, tags: ['whoosh', 'medium'],
  },
  pop_subtle: {
    prompt:   'Very subtle soft pop sound effect, 0.15 seconds, barely audible, suitable for small UI elements appearing',
    duration: 0.5, volume: 0.25, tags: ['pop', 'subtle', 'micro'],
  },
  pop_micro: {
    prompt:   'Micro pop click sound effect, 0.1 seconds, extremely subtle, barely perceptible',
    duration: 0.5, volume: 0.20, tags: ['pop', 'micro'],
  },
  impact_low: {
    prompt:   'Low cinematic impact sound effect, 0.5 seconds, heavy and grounded, suitable for chapter title cards and major reveals',
    duration: 1, volume: 0.40, tags: ['impact', 'low', 'heavy'],
  },
  impact_medium: {
    prompt:   'Medium cinematic impact sound effect, 0.6 seconds, dramatic and punchy, suitable for chapter titles and dramatic overlays',
    duration: 1, volume: 0.45, tags: ['impact', 'medium', 'dramatic'],
  },
  rise_soft: {
    prompt:   'Soft gentle rising tone sound effect, 0.4 seconds, subtle and uplifting, suitable for upward slide animations',
    duration: 1, volume: 0.30, tags: ['rise', 'soft', 'uplifting'],
  },
  rise_short: {
    prompt:   'Short rising cinematic tone, 0.5 seconds, satisfying completion sound, suitable for stat callout final value reveal',
    duration: 1, volume: 0.35, tags: ['rise', 'completion', 'satisfying'],
  },
  type_click: {
    prompt:   'Single keyboard typewriter click sound effect, 0.08 seconds, clean mechanical, suitable for typewriter text animations',
    duration: 0.5, volume: 0.25, tags: ['typewriter', 'click', 'mechanical'],
  },
  tick_completion: {
    prompt:   'Satisfying completion tick sound effect, 0.3 seconds, subtle chime, suitable for animated counter reaching final value',
    duration: 1, volume: 0.30, tags: ['tick', 'completion', 'counter'],
  },
  fade_tone: {
    prompt:   'Soft fading ambient tone, 0.5 seconds, gentle and smooth, suitable for overlay fade-out animations',
    duration: 1, volume: 0.20, tags: ['fade', 'gentle', 'ambient'],
  },
}

const OVERLAY_SOUND_MAP = {
  lower_third: {
    slide_left: 'whoosh_soft', slide_right: 'whoosh_soft',
    slide_up: 'rise_soft', slide_down: 'whoosh_soft',
    fade: 'pop_subtle', scale_up: 'rise_soft', split: 'whoosh_medium',
  },
  date_stamp: {
    fade: 'pop_subtle', slide_up: 'whoosh_soft', slide_left: 'whoosh_soft',
  },
  kinetic_text: {
    scale_in: 'impact_low', word_by_word: 'type_click',
    typewriter: 'type_click', slide_up: 'whoosh_medium', fade: 'pop_subtle',
  },
  stat_callout: {
    count_up: 'tick_completion', scale_in: 'rise_short', slide_left: 'whoosh_medium',
  },
  chapter_title: {
    fade: 'impact_medium', slide_up: 'impact_medium', scale_in: 'impact_medium',
  },
  source_citation: { fade: 'pop_micro', slide_up: 'pop_subtle' },
  watermark:       { fade: 'pop_micro' },
}

function getOverlaySoundKey(overlayType, animationEnter) {
  const typeMap = OVERLAY_SOUND_MAP[overlayType]
  if (!typeMap) return null
  return typeMap[animationEnter] || typeMap.fade || null
}

async function getOverlaySound(overlayType, animationEnter) {
  const soundKey = getOverlaySoundKey(overlayType, animationEnter)
  if (!soundKey) return null

  const existing = searchLibrary('overlay', soundKey)
  if (existing) { incrementUsage(existing.id); return existing }

  const def = OVERLAY_SOUND_DEFINITIONS[soundKey]
  if (!def) return null

  const filename   = `overlay_${soundKey}_${uuidv4()}.mp3`
  const outputPath = path.join(OVERLAY_DIR, filename)

  await generateSound({ prompt: def.prompt, durationSeconds: def.duration, outputPath, promptInfluence: 0.85 })
  const duration = await getSoundDuration(outputPath)

  return addToLibrary({
    type: 'overlay', category: soundKey,
    subtype: `${overlayType}_${animationEnter}`,
    prompt: def.prompt, filename,
    filePath: outputPath,
    url: `/library/overlay-sounds/${filename}`,
    duration, volume: def.volume, tags: def.tags,
  })
}

async function generateAllOverlaySounds(onProgress = null) {
  const results = {}
  for (const key of Object.keys(OVERLAY_SOUND_DEFINITIONS)) {
    if (onProgress) onProgress({ type: 'generating', category: 'overlay', key })
    try {
      const existing = searchLibrary('overlay', key)
      if (existing) {
        results[key] = existing
        if (onProgress) onProgress({ type: 'cached', category: 'overlay', key })
        continue
      }
      const def      = OVERLAY_SOUND_DEFINITIONS[key]
      const filename = `overlay_${key}_${uuidv4()}.mp3`
      const outputPath = path.join(OVERLAY_DIR, filename)
      await generateSound({ prompt: def.prompt, durationSeconds: def.duration, outputPath, promptInfluence: 0.85 })
      const duration = await getSoundDuration(outputPath)
      results[key] = addToLibrary({
        type: 'overlay', category: key,
        prompt: def.prompt, filename,
        filePath: outputPath,
        url: `/library/overlay-sounds/${filename}`,
        duration, volume: def.volume, tags: def.tags,
      })
      if (onProgress) onProgress({ type: 'done', category: 'overlay', key })
    } catch (err) {
      console.warn(`[overlay-sound] failed: ${key}:`, err.message)
      if (onProgress) onProgress({ type: 'error', category: 'overlay', key, message: err.message })
    }
  }
  return results
}

// ── PRE-WARM ──────────────────────────────────────────────────────────────────

async function prewarmSoundLibrary(onProgress = null) {
  const send = (data) => { if (onProgress) onProgress(data) }
  send({ type: 'phase', message: 'Generating transition stings (6)...', total: 29 })
  await generateAllStings(onProgress)
  send({ type: 'phase', message: 'Generating ambient loops (12)...', total: 29 })
  await generateAllAmbient(onProgress)
  send({ type: 'phase', message: 'Generating overlay sounds (11)...', total: 29 })
  await generateAllOverlaySounds(onProgress)
  send({ type: 'complete', message: 'Sound library ready' })
}

module.exports = {
  generateSound,
  getSting, generateAllStings, STING_DEFINITIONS,
  getAmbient, generateAllAmbient, AMBIENT_DEFINITIONS,
  getOverlaySound, getOverlaySoundKey, generateAllOverlaySounds, OVERLAY_SOUND_DEFINITIONS,
  prewarmSoundLibrary,
  OVERLAY_SOUND_MAP,
}
