const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js')
const fs   = require('fs')
const path = require('path')

const MUSIC_DIR   = path.resolve(__dirname, '../../library/music')
const AMBIENT_DIR = path.resolve(__dirname, '../../library/ambient')
;[MUSIC_DIR, AMBIENT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

function getClient() {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set')
  return new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
}

const MUSIC_INDEX_PATH   = path.resolve(__dirname, '../../library/musicIndex.json')
const AMBIENT_INDEX_PATH = path.resolve(__dirname, '../../library/ambientIndex.json')

function loadIndex(indexPath) {
  try { return JSON.parse(fs.readFileSync(indexPath, 'utf8')) } catch { return {} }
}
function saveIndex(indexPath, key, entry) {
  const index = loadIndex(indexPath)
  index[key]  = entry
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2))
}
function getCached(indexPath, dir, key) {
  const entry = loadIndex(indexPath)[key]
  if (!entry) return null
  const fullPath = path.join(dir, entry.filename)
  return fs.existsSync(fullPath) && fs.statSync(fullPath).size > 5000
    ? { path: fullPath, url: entry.url }
    : null
}

const MUSIC_PROMPTS = {
  tense:         'Dark cinematic underscore, low strings, tension building, no melody, documentary background music, suitable for narration, 60 seconds',
  triumphant:    'Epic orchestral cinematic music, strings and brass, triumphant feeling, documentary background, suitable for narration overlay, 60 seconds',
  somber:        'Melancholic piano and strings, slow tempo, emotional depth, cinematic documentary underscore, no vocals, 60 seconds',
  neutral:       'Subtle cinematic documentary background music, ambient orchestral, neutral mood, suitable for narration, unobtrusive, 60 seconds',
  dramatic:      'Intense cinematic dramatic orchestral music, documentary background, building tension, no vocals, 60 seconds',
  reflective:    'Gentle reflective piano ambient music, thoughtful mood, cinematic documentary underscore, slow and spacious, 60 seconds',
  anticipatory:  'Suspenseful building cinematic music, rising tension, documentary underscore, orchestral ambient, 60 seconds',
  institutional: 'Serious corporate cinematic documentary background music, neutral orchestral, professional tone, 60 seconds',
}

async function generateMusic(mood, customPrompt = null) {
  const cacheKey = `music_${mood}`
  const cached   = getCached(MUSIC_INDEX_PATH, MUSIC_DIR, cacheKey)
  if (cached) { console.log(`[elevenlabs-music] cache hit: ${mood}`); return cached }

  const prompt   = customPrompt || MUSIC_PROMPTS[mood] || MUSIC_PROMPTS.neutral
  const client   = getClient()
  const response = await client.textToSoundEffects.convert({ text: prompt, duration_seconds: 60, prompt_influence: 0.5 })

  const filename = `music_${mood}_${Date.now()}.mp3`
  const outPath  = path.join(MUSIC_DIR, filename)
  const chunks   = []
  for await (const chunk of response) { chunks.push(chunk) }
  const buffer = Buffer.concat(chunks)
  if (buffer.length < 10000) throw new Error(`Generated music too small: ${buffer.length} bytes`)
  fs.writeFileSync(outPath, buffer)

  const result = { path: outPath, url: `/library/music/${filename}` }
  saveIndex(MUSIC_INDEX_PATH, cacheKey, { filename, url: result.url, mood, prompt })
  console.log(`[elevenlabs-music] generated: ${filename} (${Math.round(buffer.length / 1024)} KB)`)
  return result
}

async function generateAmbient(sceneDescription, category, mood, cacheKey = null) {
  const key    = cacheKey || `ambient_${category}_${mood}`
  const cached = getCached(AMBIENT_INDEX_PATH, AMBIENT_DIR, key)
  if (cached) { console.log(`[elevenlabs-ambient] cache hit: ${key}`); return cached }

  const prompt   = buildAmbientPrompt(sceneDescription, category, mood)
  const client   = getClient()
  const response = await client.textToSoundEffects.convert({ text: prompt, duration_seconds: 30, prompt_influence: 0.7 })

  const filename = `ambient_${key}_${Date.now()}.mp3`
  const outPath  = path.join(AMBIENT_DIR, filename)
  const chunks   = []
  for await (const chunk of response) { chunks.push(chunk) }
  const buffer = Buffer.concat(chunks)
  if (buffer.length < 5000) throw new Error(`Generated ambient too small: ${buffer.length} bytes`)
  fs.writeFileSync(outPath, buffer)

  const result = { path: outPath, url: `/library/ambient/${filename}` }
  saveIndex(AMBIENT_INDEX_PATH, key, { filename, url: result.url, key, prompt })
  console.log(`[elevenlabs-ambient] generated: ${filename} (${Math.round(buffer.length / 1024)} KB)`)
  return result
}

function buildAmbientPrompt(scriptExcerpt, category, mood) {
  const categoryPrompts = {
    finance:        'Stock exchange trading floor ambient sound, distant crowd murmur, ticker sounds, 30 second loop',
    tech:           'Modern tech office ambient, server hum, air conditioning, quiet keyboard sounds, 30 second loop',
    politics:       'Government building interior ambience, distant voices echoing in marble halls, 30 second loop',
    legal:          'Quiet courtroom ambience, low murmur, air conditioning hum, 30 second loop',
    industry:       'Factory floor ambient sound, machinery hum, industrial background noise, 30 second loop',
    cities:         'City street ambient sound, distant traffic, urban environment, 30 second loop',
    media:          'Press conference room ambient, camera clicks, distant crowd, 30 second loop',
    energy:         'Industrial energy facility ambient, machinery hum, pipes, 30 second loop',
    transportation: 'Busy airport terminal ambient, distant announcements, crowd noise, 30 second loop',
    social:         'Crowd murmur, indoor gathering ambience, 30 second loop',
    business:       'Quiet corporate office ambient, subtle keyboard sounds, air conditioning, 30 second loop',
    default:        'Soft neutral room tone ambient, subtle background texture, 30 second loop',
  }
  const moodModifiers = {
    tense:       'with subtle tension, slightly uneasy',
    dramatic:    'heightened, intense background',
    somber:      'quiet, minimal, somber atmosphere',
    triumphant:  'energetic, busy, positive',
    neutral:     'neutral, unobtrusive',
    reflective:  'quiet, minimal, thoughtful',
    default:     'neutral, unobtrusive',
  }
  return `${categoryPrompts[category] || categoryPrompts.default}, ${moodModifiers[mood] || moodModifiers.default}`
}

function normaliseMood(mood) {
  const known = Object.keys(MUSIC_PROMPTS)
  if (known.includes(mood)) return mood
  const lower = (mood || '').toLowerCase()
  if (['dark','tense','ominous','threat','danger','confrontat','restrict','gravity','crisis'].some(w => lower.includes(w))) return 'tense'
  if (['triumph','celebrat','success','inspir','hope','uplift','win'].some(w => lower.includes(w))) return 'triumphant'
  if (['sad','grief','loss','fail','melanchol','somber','mourn'].some(w => lower.includes(w))) return 'somber'
  if (['reveal','dramatic','intense','urgent'].some(w => lower.includes(w))) return 'dramatic'
  if (['reflect','thought','contempl'].some(w => lower.includes(w))) return 'reflective'
  return 'neutral'
}

module.exports = {
  generateMusic,
  generateAmbient,
  buildAmbientPrompt,
  normaliseMood,
  loadMusicIndex:   () => loadIndex(MUSIC_INDEX_PATH),
  loadAmbientIndex: () => loadIndex(AMBIENT_INDEX_PATH),
  MUSIC_PROMPTS,
}
