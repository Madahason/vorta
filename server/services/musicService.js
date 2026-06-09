const https  = require('https')
const fs     = require('fs')
const path   = require('path')

const MUSIC_DIR        = path.resolve(__dirname, '../../library/music')
const MUSIC_INDEX_PATH = path.resolve(__dirname, '../../library/musicIndex.json')

if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true })

function getKey() {
  if (!process.env.FREESOUND_API_KEY) throw new Error('FREESOUND_API_KEY not set')
  return process.env.FREESOUND_API_KEY
}

function loadMusicIndex() {
  try { return JSON.parse(fs.readFileSync(MUSIC_INDEX_PATH, 'utf8')) } catch { return {} }
}

function saveMusicIndex(mood, entry) {
  const index = loadMusicIndex()
  index[mood] = entry
  fs.writeFileSync(MUSIC_INDEX_PATH, JSON.stringify(index, null, 2))
}

function getCachedTrack(mood) {
  const index = loadMusicIndex()
  const entry = index[mood]
  if (!entry?.filename) return null
  const fullPath = path.join(MUSIC_DIR, entry.filename)
  return fs.existsSync(fullPath) ? fullPath : null
}

// Mood → Freesound search config
const MOOD_QUERIES = {
  tense:         { query: 'dark cinematic tension ambient music',                duration_min: 60, duration_max: 300 },
  triumphant:    { query: 'epic orchestral triumphant cinematic music',          duration_min: 60, duration_max: 300 },
  somber:        { query: 'sad emotional piano cinematic ambient',               duration_min: 60, duration_max: 300 },
  neutral:       { query: 'documentary background ambient instrumental music',   duration_min: 60, duration_max: 300 },
  dramatic:      { query: 'dramatic cinematic intense orchestral music',         duration_min: 60, duration_max: 300 },
  reflective:    { query: 'reflective thoughtful ambient piano instrumental',    duration_min: 60, duration_max: 300 },
  anticipatory:  { query: 'building suspense cinematic ambient music',           duration_min: 60, duration_max: 300 },
  institutional: { query: 'corporate serious documentary background music',      duration_min: 60, duration_max: 300 },
  intimate:      { query: 'soft acoustic piano gentle instrumental background',  duration_min: 60, duration_max: 300 },
}

function normaliseMood(mood) {
  const known = Object.keys(MOOD_QUERIES)
  if (known.includes(mood)) return mood
  const lower = (mood || '').toLowerCase()
  if (['dark', 'tense', 'ominous', 'threat', 'danger', 'confrontat', 'restrict', 'gravity', 'crisis', 'urgent', 'suspens'].some(w => lower.includes(w))) return 'tense'
  if (['triumph', 'celebrat', 'success', 'inspir', 'hope', 'uplift', 'win'].some(w => lower.includes(w)))                                                  return 'triumphant'
  if (['sad', 'grief', 'loss', 'fail', 'melanchol', 'somber', 'mourn'].some(w => lower.includes(w)))                                                        return 'somber'
  if (['reveal', 'dramatic', 'intense', 'impact'].some(w => lower.includes(w)))                                                                             return 'dramatic'
  if (['reflect', 'thought', 'contempl'].some(w => lower.includes(w)))                                                                                      return 'reflective'
  return 'neutral'
}

async function searchFreesoundMusic(mood) {
  const key    = getKey()
  const config = MOOD_QUERIES[mood] || MOOD_QUERIES.neutral

  const params = new URLSearchParams({
    query:     config.query,
    filter:    `duration:[${config.duration_min} TO ${config.duration_max}] license:"Creative Commons 0"`,
    fields:    'id,name,duration,previews,license',
    page_size: '10',
    sort:      'rating_desc',
  })
  const url = `https://freesound.org/apiv2/search/text/?${params.toString()}`
  console.log('[music] Freesound search for mood:', mood)

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Token ${key}`, Accept: 'application/json' } }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const parsed  = JSON.parse(data)
          const results = (parsed.results || [])
            .filter(s => s.previews?.['preview-hq-mp3'])
            .map(s => ({
              id:         s.id,
              name:       s.name,
              duration:   s.duration,
              previewUrl: s.previews['preview-hq-mp3'],
              source:     'freesound',
            }))
          console.log(`[music] ${results.length} tracks for mood: ${mood}`)
          resolve(results)
        } catch (e) {
          reject(new Error(`Freesound parse error: ${e.message} — ${data.slice(0, 100)}`))
        }
      })
    }).on('error', reject)
  })
}

async function downloadMusicTrack(track, outputPath) {
  const key = getKey()
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath)

    const request = (url) => {
      https.get(url, { headers: { Authorization: `Token ${key}` } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location)
        }
        if (res.statusCode !== 200) {
          file.close()
          try { fs.unlinkSync(outputPath) } catch {}
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          const size = fs.statSync(outputPath).size
          if (size < 10000) {
            fs.unlinkSync(outputPath)
            return reject(new Error(`Music file too small: ${size} bytes`))
          }
          console.log(`[music] downloaded: ${track.name} (${Math.round(size / 1024)} KB)`)
          resolve(outputPath)
        })
        file.on('error', err => { try { fs.unlinkSync(outputPath) } catch {} reject(err) })
      }).on('error', err => { file.close(); reject(err) })
    }

    request(track.previewUrl)
  })
}

async function getMusicForMood(mood) {
  const normMood = normaliseMood(mood)

  const cached = getCachedTrack(normMood)
  if (cached) {
    console.log(`[music] cache hit for mood: ${normMood}`)
    return { path: cached, url: `/library/music/${path.basename(cached)}` }
  }

  const tracks = await searchFreesoundMusic(normMood)
  if (!tracks.length) throw new Error(`No music found on Freesound for mood: ${normMood}`)

  const best     = tracks.sort((a, b) => b.duration - a.duration)[0]
  const filename = `${normMood}_${best.id}.mp3`
  const outPath  = path.join(MUSIC_DIR, filename)

  await downloadMusicTrack(best, outPath)
  saveMusicIndex(normMood, { id: best.id, name: best.name, filename, source: 'freesound' })

  return { path: outPath, url: `/library/music/${filename}` }
}

module.exports = { getMusicForMood, normaliseMood, loadMusicIndex, getCachedTrack }
